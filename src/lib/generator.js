/* =====================================================================
   GENERATOR — synthetic sample base from the fixed seed in core.js.
   Replace generateBase() with your own API call; the shape it returns
   is the contract the rest of the system reads.
   ===================================================================== */
import {
  TODAY, rnd, pick, ib, bt, addD, yrs, projByName,
  PROJECTS, F, L, OCC, CITY, COMM, SRC, CTXT,
} from './core.js';

let SEQ = 1000;
export const nextCustomerId = () => 'NEO-C-' + ++SEQ;

export function makeUnit(p, forceYear) {
  const by = forceYear || ib(p.launch, 2026);
  let bd = new Date(by, ib(0, 11), ib(1, 28));
  if (bd > TODAY) bd = new Date(2025, ib(0, 11), ib(1, 28));
  const hold = yrs(bd, TODAY);
  const rate = Math.round(p.lr * Math.pow(1.16, by - p.launch) * bt(0.96, 1.06));
  const saleable = pick([845, 980, 1120, 1250, 1380, 1550, 1720, 1950, 2200, 2450]);
  const loading = ib(29, 37);
  const carpet = Math.round(saleable * (1 - loading / 100));
  const disc = rnd() < 0.4 ? ib(0, 12) * 10000 : 0;
  const consid = rate * saleable - disc;
  const pr = hold > 3 ? bt(0.86, 1) : hold > 1.5 ? bt(0.55, 0.98) : bt(0.18, 0.72);
  const paid = Math.round(consid * (pr > 0.97 ? 1 : pr));
  const reg = pr > 0.92 && hold > 1.7;
  const loanY = rnd() < 0.62;
  const ten = loanY ? pick([10, 12, 15, 15, 20, 20, 25]) : 0;
  return {
    unit: p.code + '-' + pick(['A', 'B', 'C', 'D']) + '-' + ib(101, 904),
    project: p.name,
    entity: p.entity,
    type: pick(['2 BHK', '2 BHK', '3 BHK', '3 BHK', '3 BHK', '4 BHK', 'Villa', 'Plot']),
    carpet, saleable, loading, bookDate: bd,
    agrDate: addD(bd, ib(30, 120)),
    regDate: reg ? addD(bd, ib(400, Math.max(430, hold * 340))) : null,
    possDate: hold > 2.5 ? addD(bd, ib(760, 1150)) : null,
    rate, discount: disc, consideration: consid, paid,
    receipts: ib(6, 16),
    bounced: rnd() < 0.14 ? ib(1, 3) : 0,
    lastReceipt: addD(bd, ib(200, Math.max(220, hold * 330))),
    loan: loanY
      ? {
          bank: pick(['HDFC Ltd', 'SBI', 'ICICI', 'Bank of Baroda', 'LIC HFL', 'PNB HF']),
          tenure: ten,
          start: addD(bd, ib(90, 200)),
          closure: new Date(bd.getFullYear() + ten, bd.getMonth(), 1),
          closed: false, prepaid: rnd() < 0.22, selfFunded: false,
        }
      : { bank: null, tenure: 0, start: null, closure: null, closed: true, prepaid: false, selfFunded: true },
    val: { ask: p.ask, resale: p.resale, circle: p.circle, notedOn: p.noted, basis: p.basis, by: p.by },
    exited: false,
  };
}

export function generateBase(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const occ = pick(OCC);
    const hasSpouse = rnd() < 0.88;
    const units = [makeUnit(pick(PROJECTS))];
    if (rnd() < 0.07) units.push(makeUnit(pick(PROJECTS)));

    /* older loans get foreclosed */
    units.forEach((u) => {
      if (!u.loan.selfFunded) {
        if (u.loan.closure <= TODAY) { u.loan.closed = true; u.loan.closedOn = u.loan.closure; }
        else if (u.loan.prepaid && rnd() < 0.45) { u.loan.closed = true; u.loan.closedOn = addD(u.loan.start, ib(1200, 2100)); }
      }
    });

    /* owner status */
    let st = 'ACTIVE', stSince = null, stNote = null;
    const rr = rnd();
    if (rr < 0.035) {
      st = 'EXITED';
      const u = units[0];
      u.exited = true;
      u.exitDate = addD(u.bookDate, ib(1500, 2200));
      u.exitRate = Math.round(projByName(u.project).resale * bt(0.78, 0.92));
      stSince = u.exitDate;
      stNote = 'Unit sold to a third party on the open market. Neoteric was not the buyer and earned no commission on the trade.';
    } else if (rr < 0.055) {
      st = 'TRANSFER_IN_PROGRESS';
      stSince = addD(TODAY, -ib(30, 300));
      stNote = "Ownership transfer to the nominee is under process. Records retained under the nominee's instruction.";
    }

    const openC = st === 'ACTIVE' && rnd() < 0.15;
    const cAge = openC ? ib(4, 190) : 0;
    const cap = { dob: rnd() < 0.42, anniv: rnd() < 0.24, kid: rnd() < 0.19, occ: rnd() < 0.61, addr: rnd() < 0.72 };
    const marketing = st === 'ACTIVE' && rnd() < 0.88;

    const nRef = rnd() < 0.33 ? ib(1, 5) : 0;
    const refs = [];
    for (let k = 0; k < nRef; k++) {
      const s = rnd();
      refs.push({
        n: pick(F) + ' ' + pick(L),
        date: addD(TODAY, -ib(60, 1500)),
        status: s < 0.45 ? 'Booked' : s < 0.7 ? 'Lost — budget' : 'Open — no follow-up logged',
      });
    }

    out.push({
      id: nextCustomerId(), status: st, statusSince: stSince, statusNote: stNote,
      salutation: pick(['Mr.', 'Mr.', 'Mr.', 'Mrs.', 'Dr.', 'Smt.']),
      name: pick(F) + ' ' + pick(L),
      coApplicant: hasSpouse ? pick(F) + ' ' + pick(L) : null,
      coRelation: 'Spouse',
      coOnAgreement: hasSpouse && rnd() < 0.8,
      dob: new Date(ib(1962, 1993), ib(0, 11), ib(1, 28)),
      spouseDob: hasSpouse ? new Date(ib(1988, 2018), ib(0, 11), ib(1, 28)) : null,
      children: rnd() < 0.7 ? [{ n: pick(F), dob: new Date(ib(2006, 2022), ib(0, 11), ib(1, 28)) }] : [],
      pan: String.fromCharCode(65 + ib(0, 25), 65 + ib(0, 25), 65 + ib(0, 25)) + 'P' +
           String.fromCharCode(65 + ib(0, 25)) + '••••' + String.fromCharCode(65 + ib(0, 25)),
      aadhaarHeld: true,
      kycDate: addD(units[0].bookDate, ib(2, 20)),
      mobile: '+91 9' + ib(1000, 9999) + ' ••' + ib(100, 999),
      /* No email is ever generated — but this draw must stay, or every
         random value after it shifts and the sample base changes. */
      email: rnd() < 0.7 ? null : null,
      corrAddr: cap.addr
        ? pick(['Kailash Vihar', 'Thatipur Extension', 'City Centre', 'Govindpuri', 'Darpan Colony', 'Sirol Road']) + ', Gwalior 4740' + ib(10, 25)
        : 'Address not updated since booking',
      city: pick(CITY), occupation: occ.k, occBand: occ.b,
      incomeBand: cap.occ ? occ.band : null,
      community: pick(COMM),
      captured: cap,
      consent: {
        whatsapp: st === 'ACTIVE', sms: st === 'ACTIVE', email: rnd() < 0.4, marketing,
        date: st === 'ACTIVE' ? addD(TODAY, -ib(30, 500)) : null,
        purpose: marketing ? 'Portfolio statements, launch invitations, service updates' : 'Service and documentation only',
        children: cap.kid,
      },
      source: pick(SRC), referredBy: null,
      units,
      complaints: Array.from({ length: ib(0, 3) }, () => {
        const rd = addD(TODAY, -ib(200, 1600));
        return { t: pick(CTXT), raised: rd, closed: addD(rd, ib(3, 60)), days: ib(3, 60) };
      }),
      openComplaints: openC
        ? [{ t: pick(CTXT), raised: addD(TODAY, -cAge), days: cAge, owner: pick(['AGM Projects', 'AGM CRM', 'Site Engineering']), ncr: 'NCR-2026-0' + ib(100, 999) }]
        : [],
      nps: st === 'ACTIVE' ? (openC ? ib(2, 6) : ib(6, 10)) : null,
      npsDate: addD(TODAY, -ib(20, 400)),
      litigation: rnd() < 0.022,
      referrals: refs,
      events: Array.from({ length: ib(0, 3) }, () => ({
        n: pick(['Owners meet', 'Aarambh evening', 'Launch preview', 'Diwali get-together']),
        d: addD(TODAY, -ib(60, 900)),
      })),
      siteVisits: ib(0, 7),
      portalLast: rnd() < 0.31 ? addD(TODAY, -ib(2, 200)) : null,
      statements: [],
    });
  }

  /* referral genealogy */
  out.forEach((c, i) => {
    if (c.source === 'Customer referral' && i > 12) {
      const p = out[ib(0, Math.min(i - 1, 70))];
      c.referredBy = { n: p.name, id: p.id };
    }
  });

  /* statement send history on a clean subset — the pilot that already went out */
  out.filter((c) => c.status === 'ACTIVE' && !c.openComplaints.length && c.consent.marketing)
    .slice(0, 46)
    .forEach((c) => {
      c.statements.push({
        d: addD(TODAY, -ib(20, 120)), v: 'v1.0',
        ch: pick(['WhatsApp PDF', 'WhatsApp PDF', 'Hand delivered', 'Email PDF']),
        opened: rnd() < 0.86, profileDone: rnd() < 0.63, disputed: rnd() < 0.09,
        askedToSell: rnd() < 0.11, askedNewProject: rnd() < 0.28,
      });
    });

  return out;
}
