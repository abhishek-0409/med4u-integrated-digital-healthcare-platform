declare module "react-native-razorpay" {
  interface RazorpayCheckoutOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string };
  }

  interface RazorpayCheckoutResult {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }

  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutResult>;
  };

  export default RazorpayCheckout;
}
