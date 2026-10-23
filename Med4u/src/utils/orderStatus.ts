import { BadgeTone } from "../components/ui/StatusBadge";
import { OrderStatus, PrescriptionRejectionReason, PrescriptionReviewStatus } from "../types/order";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone; description: string }> = {
  PLACED: {
    label: "Order placed",
    tone: "info",
    description: "The pharmacy will confirm your order shortly.",
  },
  PENDING_REVIEW: {
    label: "Awaiting prescription review",
    tone: "warning",
    description: "A pharmacist must review your prescription before this order is processed.",
  },
  CONFIRMED: {
    label: "Confirmed",
    tone: "primary",
    description: "The pharmacy has confirmed your order.",
  },
  PROCESSING: {
    label: "Being prepared",
    tone: "info",
    description: "The pharmacy is preparing your order.",
  },
  SHIPPED: {
    label: "Shipped",
    tone: "info",
    description: "Your order has been handed over for delivery.",
  },
  DELIVERED: {
    label: "Delivered",
    tone: "success",
    description: "Your order was marked as delivered.",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "neutral",
    description: "This order was cancelled and its items were returned to stock.",
  },
};

export const PRESCRIPTION_STATUS: Record<PrescriptionReviewStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Awaiting review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Not accepted", tone: "danger" },
};

export const REJECTION_TEXT: Record<PrescriptionRejectionReason, string> = {
  ILLEGIBLE: "The prescription was not legible. Please upload a clearer photo.",
  EXPIRED: "The prescription has expired. Please upload a current one.",
  INCOMPLETE: "The prescription was incomplete. Please upload the full document.",
  MEDICINE_NOT_COVERED: "The prescription does not cover the medicines in this order.",
  NOT_A_PRESCRIPTION: "The file was not a prescription.",
  OTHER: "The prescription could not be accepted.",
};

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** "Order #1A2B3C4D": a short reference derived from the order id. */
export const orderReference = (id: string): string => `#${id.slice(0, 8).toUpperCase()}`;
