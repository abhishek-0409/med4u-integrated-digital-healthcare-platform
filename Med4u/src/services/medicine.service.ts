import { Paginated } from "../types/api";
import { MedicineCategory, MedicineListParams, MedicineProduct } from "../types/medicine";
import { api } from "./api/client";

export const medicineService = {
  /** Public catalog; filtering, sorting and paging all happen on the server. */
  list(params: MedicineListParams = {}): Promise<Paginated<MedicineProduct>> {
    return api.getPage<MedicineProduct>("/v1/medicines", { params });
  },

  getById(id: string): Promise<MedicineProduct> {
    return api.get<MedicineProduct>(`/v1/medicines/${encodeURIComponent(id)}`);
  },

  categories(): Promise<MedicineCategory[]> {
    return api.get<MedicineCategory[]>("/v1/medicines/categories");
  },
};
