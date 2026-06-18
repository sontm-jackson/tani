import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { config, explorerTx, explorerAccount } from "./config.js";
import { usdc } from "./stellar/client.js";
import { getAssetBalance } from "./stellar/account.js";
import { issueAsset } from "./stellar/payments.js";
import { provisionWallet } from "./services/custody.js";
import { processEvent } from "./services/disburse.js";
import { cashOut } from "./services/anchor.js";
import { anchorInfo } from "./services/anchorInfo.js";
import { newQrToken, verifyAndPay } from "./services/shipments.js";
import { requestOtp, verifyOtp, farmerIdFromToken, issueSessionForPhone } from "./services/auth.js";
import { verifyFirebasePhone } from "./services/firebaseAuth.js";
import { firebaseConfigured } from "./config.js";
import { encrypt } from "./crypto.js";

export const router = Router();

const wrap = (fn: (req: any, res: any) => Promise<any>) => (req: any, res: any) =>
  fn(req, res).catch((e: any) => {
    console.error(e);
    res.status(400).json({ error: e?.message ?? String(e) });
  });

router.get("/health", (_req, res) => res.json({ ok: true, network: config.network }));

// Live anchor connectivity (SEP-1) — proves real anchor integration.
router.get("/anchor/info", wrap(async (_req, res) => res.json(await anchorInfo())));

// ---- Auth (phone OTP login) ----
// Tells the client which login flow to use.
router.get("/auth/config", (_req, res) => res.json({ firebase: firebaseConfigured }));

// Firebase phone auth: client verifies the phone with Firebase, sends us the ID token,
// we verify it and issue our session.
router.post("/auth/firebase", wrap(async (req, res) => {
  const { idToken } = z.object({ idToken: z.string().min(10) }).parse(req.body);
  const phone = await verifyFirebasePhone(idToken);
  res.json(await issueSessionForPhone(phone));
}));

router.post("/auth/request-otp", wrap(async (req, res) => {
  const { phone } = z.object({ phone: z.string().min(3) }).parse(req.body);
  res.json(await requestOtp(phone.trim()));
}));

router.post("/auth/verify-otp", wrap(async (req, res) => {
  const { phone, code } = z.object({ phone: z.string().min(3), code: z.string().min(4) }).parse(req.body);
  res.json(await verifyOtp(phone.trim(), code.trim()));
}));

// Bearer-token guard: resolves the signed-in farmer from the JWT.
const requireFarmer = (req: any, res: any, next: any) => {
  const id = farmerIdFromToken(req.headers.authorization);
  if (!id) return res.status(401).json({ error: "not signed in" });
  req.farmerId = id;
  next();
};

// ---- Me (authenticated farmer) ----
router.get("/me", requireFarmer, wrap(async (req: any, res) => res.json(await farmerDetail(req.farmerId))));

router.post("/me/cashout", requireFarmer, wrap(async (req: any, res) => {
  const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
  const result = await cashOut(req.farmerId, amount);
  res.json({ ...result, explorer: result.txHash ? explorerTx(result.txHash) : null });
}));

router.post("/me/payout-method", requireFarmer, wrap(async (req: any, res) => {
  const body = z
    .object({
      payoutType: z.enum(["bank", "momo"]),
      payoutProvider: z.string().min(1),
      payoutAccount: z.string().min(3),
      payoutName: z.string().min(1),
    })
    .parse(req.body);
  await prisma.farmer.update({ where: { id: req.farmerId }, data: body });
  res.json(await farmerDetail(req.farmerId));
}));

router.get("/me/shipments", requireFarmer, wrap(async (req: any, res) => {
  const list = await prisma.shipment.findMany({
    where: { farmerId: req.farmerId },
    include: { farmer: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(list.map(shipmentView));
}));

router.post("/me/shipments", requireFarmer, wrap(async (req: any, res) => {
  const body = z
    .object({
      commodity: z.string().default("coffee"),
      variety: z.string().optional(),
      claimedKg: z.number().positive(),
      grade: z.string().optional(),
      processing: z.string().optional(),
      moisture: z.number().optional(),
      certification: z.string().optional(),
      harvestDate: z.string().optional(),
    })
    .parse(req.body);
  const farmer = await prisma.farmer.findUnique({ where: { id: req.farmerId } });
  if (!farmer) throw new Error("farmer not found");
  const s = await prisma.shipment.create({
    data: { operatorId: farmer.operatorId, farmerId: farmer.id, qrToken: newQrToken(), ...body },
    include: { farmer: true },
  });
  res.json(shipmentView(s));
}));

// ---- Operator (single default operator in the demo) ----
router.get("/operator", wrap(async (_req, res) => {
  const op = await prisma.operator.findFirst();
  if (!op) return res.status(404).json({ error: "no operator — run `npm run seed`" });
  const [poolUsdc, farmers, lots, disbursements] = await Promise.all([
    getAssetBalance(op.poolPublicKey, config.assetCode),
    prisma.farmer.count({ where: { operatorId: op.id } }),
    prisma.lot.count({ where: { operatorId: op.id } }),
    prisma.disbursement.count({ where: { operatorId: op.id } }),
  ]);
  res.json({
    id: op.id,
    name: op.name,
    region: op.region,
    poolPublicKey: op.poolPublicKey,
    poolExplorer: explorerAccount(op.poolPublicKey),
    poolBalance: poolUsdc,
    assetCode: config.assetCode,
    counts: { farmers, lots, disbursements },
  });
}));

// Mint more USDC into the pool (issuer). Simulates the operator on-ramping fiat.
router.post("/pool/fund", wrap(async (req, res) => {
  const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
  if (!config.issuerSecret) throw new Error("ISSUER_SECRET not set — run seed");
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator");
  const hash = await issueAsset(config.issuerSecret, op.poolPublicKey, usdc(), amount);
  res.json({ ok: true, txHash: hash, explorer: explorerTx(hash) });
}));

// ---- Farmers ----
router.get("/farmers", wrap(async (_req, res) => {
  const farmers = await prisma.farmer.findMany({
    include: { wallet: true, payments: true },
    orderBy: { createdAt: "asc" },
  });
  const withBalance = await Promise.all(
    farmers.map(async (f) => ({
      id: f.id,
      name: f.name,
      phone: f.phone,
      village: f.village,
      publicKey: f.wallet?.publicKey,
      balance: f.wallet ? await getAssetBalance(f.wallet.publicKey, config.assetCode) : 0,
      totalReceived: f.payments.reduce((s, p) => s + p.amount, 0),
    }))
  );
  res.json(withBalance);
}));

router.get("/farmers/by-phone/:phone", wrap(async (req, res) => {
  const f = await prisma.farmer.findUnique({
    where: { phone: req.params.phone },
    include: { wallet: true },
  });
  if (!f) return res.status(404).json({ error: "farmer not found" });
  res.json(await farmerDetail(f.id));
}));

router.get("/farmers/:id", wrap(async (req, res) => {
  res.json(await farmerDetail(req.params.id));
}));

router.post("/farmers", wrap(async (req, res) => {
  const body = z
    .object({ name: z.string().min(1), phone: z.string().min(3), village: z.string().optional() })
    .parse(req.body);
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator");
  const kp = await provisionWallet(usdc());
  const farmer = await prisma.farmer.create({
    data: {
      operatorId: op.id,
      name: body.name,
      phone: body.phone,
      village: body.village,
      wallet: { create: { publicKey: kp.publicKey, secret: encrypt(kp.secret), trustline: true } },
    },
    include: { wallet: true },
  });
  res.json({ id: farmer.id, name: farmer.name, phone: farmer.phone, village: farmer.village });
}));

router.post("/farmers/:id/cashout", wrap(async (req, res) => {
  const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
  const result = await cashOut(req.params.id, amount);
  res.json({ ...result, explorer: result.txHash ? explorerTx(result.txHash) : null });
}));

// Farmer sets/updates the payout destination an anchor would send local currency to.
router.post("/farmers/:id/payout-method", wrap(async (req, res) => {
  const body = z
    .object({
      payoutType: z.enum(["bank", "momo"]),
      payoutProvider: z.string().min(1),
      payoutAccount: z.string().min(3),
      payoutName: z.string().min(1),
    })
    .parse(req.body);
  await prisma.farmer.update({ where: { id: req.params.id }, data: body });
  res.json(await farmerDetail(req.params.id));
}));

// ---- Shipments (QR-declared deliveries) ----
const shipmentView = (s: any) => ({
  id: s.id,
  qrToken: s.qrToken,
  status: s.status,
  commodity: s.commodity,
  farmerId: s.farmerId,
  farmerName: s.farmer?.name,
  village: s.farmer?.village,
  variety: s.variety,
  claimedKg: s.claimedKg,
  verifiedKg: s.verifiedKg,
  grade: s.grade,
  processing: s.processing,
  moisture: s.moisture,
  certification: s.certification,
  harvestDate: s.harvestDate,
  amountPaid: s.amountPaid,
  discrepancies: s.discrepancies ? JSON.parse(s.discrepancies) : [],
  note: s.note,
  explorer: s.paymentTxHash ? explorerTx(s.paymentTxHash) : null,
  createdAt: s.createdAt,
});

// Farmer declares a shipment -> gets a QR token.
router.post("/shipments", wrap(async (req, res) => {
  const body = z
    .object({
      farmerId: z.string(),
      commodity: z.string().default("coffee"),
      variety: z.string().optional(),
      claimedKg: z.number().positive(),
      grade: z.string().optional(),
      processing: z.string().optional(),
      moisture: z.number().optional(),
      certification: z.string().optional(),
      harvestDate: z.string().optional(),
    })
    .parse(req.body);
  const farmer = await prisma.farmer.findUnique({ where: { id: body.farmerId } });
  if (!farmer) throw new Error("farmer not found");
  const s = await prisma.shipment.create({
    data: { operatorId: farmer.operatorId, qrToken: newQrToken(), ...body },
    include: { farmer: true },
  });
  res.json(shipmentView(s));
}));

router.get("/shipments", wrap(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const list = await prisma.shipment.findMany({
    where: status ? { status } : undefined,
    include: { farmer: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(list.map(shipmentView));
}));

router.get("/shipments/by-token/:token", wrap(async (req, res) => {
  const s = await prisma.shipment.findUnique({
    where: { qrToken: req.params.token },
    include: { farmer: true },
  });
  if (!s) return res.status(404).json({ error: "shipment not found for that code" });
  res.json(shipmentView(s));
}));

// Operator verifies a scanned shipment and pays (adjust-and-pay) or rejects.
router.post("/shipments/:id/verify", wrap(async (req, res) => {
  const body = z
    .object({
      verifiedKg: z.number().positive().optional(),
      discrepancies: z.array(z.string()).optional(),
      note: z.string().optional(),
      accept: z.boolean().default(true),
    })
    .parse(req.body);
  const result = await verifyAndPay(req.params.id, body);
  res.json({ ...shipmentView({ ...result, farmer: null }), txHash: result.paymentTxHash });
}));

// ---- Lots ----
router.get("/lots", wrap(async (_req, res) => {
  const lots = await prisma.lot.findMany({
    include: { contributions: { include: { farmer: true } }, events: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    lots.map((l) => ({
      id: l.id,
      code: l.code,
      commodity: l.commodity,
      status: l.status,
      totalKg: l.contributions.reduce((s, c) => s + c.quantityKg, 0),
      contributions: l.contributions.map((c) => ({
        farmerId: c.farmerId,
        farmerName: c.farmer.name,
        quantityKg: c.quantityKg,
      })),
    }))
  );
}));

router.post("/lots", wrap(async (req, res) => {
  const body = z
    .object({
      code: z.string().min(1),
      commodity: z.string().default("coffee"),
      contributions: z.array(z.object({ farmerId: z.string(), quantityKg: z.number().positive() })),
    })
    .parse(req.body);
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator");
  const lot = await prisma.lot.create({
    data: {
      operatorId: op.id,
      code: body.code,
      commodity: body.commodity,
      contributions: { create: body.contributions },
    },
    include: { contributions: true },
  });
  res.json(lot);
}));

// The simulate-trigger: verify a lot -> emit lot.verified event -> auto-disburse.
router.post("/lots/:id/verify", wrap(async (req, res) => {
  const lot = await prisma.lot.findUnique({ where: { id: req.params.id } });
  if (!lot) throw new Error("lot not found");
  const disb = await ingestEvent(lot.operatorId, "lot.verified", lot.id, `lot.verified:${lot.id}`);
  res.json({ ...disb, explorer: disb.txHash ? explorerTx(disb.txHash) : null });
}));

// ---- Rules ----
router.get("/rules", wrap(async (_req, res) => {
  res.json(await prisma.rule.findMany({ orderBy: { createdAt: "asc" } }));
}));

router.post("/rules", wrap(async (req, res) => {
  const body = z
    .object({
      name: z.string().min(1),
      eventType: z.string().default("lot.verified"),
      commodity: z.string().default("coffee"),
      ratePerKg: z.number().positive(),
    })
    .parse(req.body);
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator");
  res.json(await prisma.rule.create({ data: { operatorId: op.id, ...body } }));
}));

// ---- Events (generic ingest, for real traceability sources) ----
router.post("/events", wrap(async (req, res) => {
  const body = z
    .object({
      type: z.string().default("lot.verified"),
      lotCode: z.string(),
      idempotencyKey: z.string().optional(),
    })
    .parse(req.body);
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error("no operator");
  const lot = await prisma.lot.findFirst({ where: { operatorId: op.id, code: body.lotCode } });
  if (!lot) throw new Error(`lot ${body.lotCode} not found`);
  const key = body.idempotencyKey ?? `${body.type}:${lot.id}`;
  const disb = await ingestEvent(op.id, body.type, lot.id, key);
  res.json({ ...disb, explorer: disb.txHash ? explorerTx(disb.txHash) : null });
}));

// ---- Disbursements ----
router.get("/disbursements", wrap(async (_req, res) => {
  const ds = await prisma.disbursement.findMany({
    include: { payments: { include: { farmer: true } }, event: { include: { lot: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    ds.map((d) => ({
      id: d.id,
      status: d.status,
      txHash: d.txHash,
      explorer: d.txHash ? explorerTx(d.txHash) : null,
      totalAmount: d.totalAmount,
      error: d.error,
      createdAt: d.createdAt,
      lot: d.event?.lot?.code,
      eventType: d.event?.type,
      payments: d.payments.map((p) => ({
        farmerName: p.farmer.name,
        amount: p.amount,
        reason: p.reason,
      })),
    }))
  );
}));

// ---- helpers ----
async function ingestEvent(operatorId: string, type: string, lotId: string, key: string) {
  const existing = await prisma.event.findUnique({
    where: { idempotencyKey: key },
    include: { disbursement: { include: { payments: { include: { farmer: true } } } } },
  });
  if (existing) {
    if (existing.disbursement) return existing.disbursement;
    return processEvent(existing.id);
  }
  const event = await prisma.event.create({
    data: { operatorId, type, lotId, idempotencyKey: key, status: "received" },
  });
  return processEvent(event.id);
}

async function farmerDetail(id: string) {
  const f = await prisma.farmer.findUnique({
    where: { id },
    include: {
      wallet: true,
      payments: {
        include: { disbursement: { include: { event: { include: { lot: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      cashOuts: { orderBy: { createdAt: "desc" } },
      shipments: { where: { status: "paid" }, orderBy: { verifiedAt: "desc" } },
    },
  });
  if (!f) throw new Error("farmer not found");
  const balance = f.wallet ? await getAssetBalance(f.wallet.publicKey, config.assetCode) : 0;
  const lotPayments = f.payments.map((p) => ({
    id: p.id,
    amount: p.amount,
    reason: p.reason,
    explorer: p.disbursement?.txHash ? explorerTx(p.disbursement.txHash) : null,
    createdAt: p.createdAt,
  }));
  const shipmentPayments = f.shipments.map((s) => ({
    id: s.id,
    amount: s.amountPaid ?? 0,
    reason: `Shipment verified · ${s.variety ?? s.commodity} · ${s.verifiedKg}kg`,
    explorer: s.paymentTxHash ? explorerTx(s.paymentTxHash) : null,
    createdAt: s.verifiedAt ?? s.createdAt,
  }));
  const payments = [...lotPayments, ...shipmentPayments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    id: f.id,
    name: f.name,
    phone: f.phone,
    village: f.village,
    publicKey: f.wallet?.publicKey,
    explorer: f.wallet ? explorerAccount(f.wallet.publicKey) : null,
    balance,
    assetCode: config.assetCode,
    payout: f.payoutAccount
      ? { type: f.payoutType, provider: f.payoutProvider, account: f.payoutAccount, name: f.payoutName }
      : null,
    payments,
    cashOuts: f.cashOuts.map((c) => ({
      id: c.id,
      amountUsdc: c.amountUsdc,
      amountLocal: c.amountLocal,
      currency: c.currency,
      destMasked: c.destMasked,
      status: c.status,
      txHash: c.txHash,
      createdAt: c.createdAt,
    })),
  };
}
