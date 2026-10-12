import { getOrderDetails, normalizeOrderId } from "../lib/orders.ts";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
}

check("normalize 'ord 101'", normalizeOrderId("ord 101") === "ORD-101");
check("normalize 'ORD-one zero one'", normalizeOrderId("ORD-one zero one") === "ORD-101");
check("normalize '102'", normalizeOrderId("102") === "ORD-102");
check("normalize garbage", normalizeOrderId("hello") === null);

const a: any = getOrderDetails("ORD-101");
check("ORD-101 found, Out for Delivery", a.found && a.status === "Out for Delivery");
check("ORD-101 not cancellable", a.cancellation.eligible === false);

const b: any = getOrderDetails("ORD-102");
check("ORD-102 return NOT eligible (14 days)", b.found && b.return.eligible === false);

const c: any = getOrderDetails("ORD-103");
check("ORD-103 cancellable", c.found && c.cancellation.eligible === true);

const d: any = getOrderDetails("ORD-999");
check("ORD-999 not found", d.found === false && d.error === "ORDER_NOT_FOUND");

const e: any = getOrderDetails(undefined);
check("missing id handled", e.found === false && e.error === "MISSING_OR_UNREADABLE_ORDER_ID");

process.exit(failed ? 1 : 0);
