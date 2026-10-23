export interface LabTest {
  id: string; name: string; category: string; description: string | null; price: number;
  turnaroundDays: number; sampleType: string; preparationInstructions: string;
  homeCollectionAvailable: boolean; labLocation: string; isDemo: boolean;
}
export interface LabBooking {
  id: string; reference: string; testId: string; preferredDate: string; preferredTime: string; homeCollection: boolean;
  address?: { line1: string; line2?: string; city: string; state: string; pincode: string };
  status: 'pending' | 'confirmed' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
  contactName?: string | null; contactPhone?: string | null;
  priceSnapshot: number; createdAt: string; test: Pick<LabTest, 'name' | 'category' | 'isDemo'>;
}
