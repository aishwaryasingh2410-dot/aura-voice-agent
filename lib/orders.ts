// Mock order database + the get_order_details tool.
// Eligibility is computed here in code (not left to the LLM) so policy
// decisions are deterministic and the model only has to communicate them.

export type OrderStatus = "Processing" | "Shipped" | "Out for Delivery" | "Delivered";

export type Order = {
  id: string;
  customer: string;
  product: string;
  value: number;
  status: OrderStatus;
  carrier?: string;
  tracking?: string;
  note: string;
  deliveredDaysAgo?: number;
};

export const ORDERS: Record<string, Order> = {
  "ORD-101": {
    id: "ORD-101",
    customer: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    value: 699,
    status: "Out for Delivery",
    carrier: "BlueDart",
    tracking: "BD-982103",
    note: "Expected by 6 PM today",
  },
  "ORD-102": {
    id: "ORD-102",
    customer: "Rahul Verma",
    product: "Hydrating Sunscreen SPF 50",
    value: 499,
    status: "Delivered",
    carrier: "Delhivery",
    tracking: "DL-441029",
    note: "Delivered 14 days ago",
    deliveredDaysAgo: 14,
  },
  "ORD-103": {
    id: "ORD-103",
    customer: "Ananya Patel",
    product: "Green Tea Face Wash + Toner",
    value: 850,
    status: "Processing",
    note: "Ordered 3 hours ago. Eligible for cancellation",
  },
};

const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

/** Turn what speech-to-text produced ("ord 101", "ORD-one zero one", "101") into "ORD-101". */
export function normalizeOrderId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tokens = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  let digits = "";
  for (const t of tokens) {
    if (/^\d+$/.test(t)) digits += t;
    else if (WORD_DIGITS[t] !== undefined) digits += WORD_DIGITS[t];
  }
  if (!digits) return null;
  return `ORD-${digits}`;
}

export function getOrderDetails(rawOrderId: unknown) {
  const id = normalizeOrderId(rawOrderId);
  if (!id) {
    return {
      found: false,
      error: "MISSING_OR_UNREADABLE_ORDER_ID",
      message: "No usable order ID was provided. Ask the customer to say or repeat their order ID (format ORD-xxx).",
    };
  }
  const order = ORDERS[id];
  if (!order) {
    return {
      found: false,
      error: "ORDER_NOT_FOUND",
      order_id: id,
      message: `No order exists with ID ${id}. Ask the customer to repeat or verify the ID. Do not guess.`,
    };
  }

  // --- policy eligibility, computed deterministically ---
  const cancellable = order.status === "Processing";
  const cancellation = cancellable
    ? { eligible: true, reason: "Order is still Processing, so it can be cancelled." }
    : {
        eligible: false,
        reason:
          order.status === "Delivered"
            ? "Order is already delivered, so it cannot be cancelled."
            : `Order is ${order.status}; cancellation is only possible while Processing. The customer may refuse delivery at the doorstep.`,
      };

  let ret: { eligible: boolean; reason: string };
  if (order.status !== "Delivered") {
    ret = { eligible: false, reason: "Order has not been delivered yet, so no return can be started." };
  } else if ((order.deliveredDaysAgo ?? 0) > 7) {
    ret = {
      eligible: false,
      reason: `Delivered ${order.deliveredDaysAgo} days ago; the return window is 7 days from delivery, so it is outside the return policy. (Damaged/defective items had to be reported within 48 hours of delivery.)`,
    };
  } else {
    ret = {
      eligible: true,
      reason: "Within 7 days of delivery. Eligible only if the product is unopened, unused and in original packaging.",
    };
  }

  return {
    found: true,
    order_id: order.id,
    customer_first_name: order.customer.split(" ")[0],
    product: order.product,
    value_inr: order.value,
    status: order.status,
    carrier: order.carrier ?? null,
    tracking_number: order.tracking ?? null,
    note: order.note,
    cancellation,
    return: ret,
  };
}

export function runTool(name: string, args: any) {
  if (name === "get_order_details") return getOrderDetails(args?.order_id);
  return { error: "UNKNOWN_TOOL", message: `No tool named ${name}` };
}

export const TOOL_DECLARATIONS = [
  {
    name: "get_order_details",
    description:
      "Look up a customer's order in the Aura Skincare order database by order ID. Returns status, product, value, tracking info, and whether the order is currently eligible for cancellation or return. Call this whenever the customer asks about the status/tracking/cancellation/return of a specific order.",
    parameters: {
      type: "OBJECT",
      properties: {
        order_id: {
          type: "STRING",
          description: "The order ID exactly as the customer said it, e.g. 'ORD-101' or 'ord 101'.",
        },
      },
      required: ["order_id"],
    },
  },
];
