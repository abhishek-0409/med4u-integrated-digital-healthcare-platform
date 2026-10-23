import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { appointmentApi, doctorProfileApi } from "../services/appointmentApi";
import { DashboardResult, loadDashboard } from "./loadDashboard";

const STALE_AFTER_MS = 30_000;

const deps = {
  listAppointments: appointmentApi.list,
  doctorDetail: doctorProfileApi.detail,
  doctorSlots: doctorProfileApi.slots,
};

export interface DashboardState {
  result: DashboardResult | null;
  /** First load only; later refreshes keep showing the previous data. */
  loading: boolean;
  refreshing: boolean;
  refresh(): Promise<void>;
}

/** Loads on focus (at most every 30s) and on pull-to-refresh. Ignores results that arrive after unmount. */
export function useDashboard(doctorId: string): DashboardState {
  const [result, setResult] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoadedAt = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const task = loadDashboard(deps, doctorId).then((next) => {
      if (!alive.current) return;
      lastLoadedAt.current = Date.now();
      setResult(next);
    }).finally(() => {
      inFlight.current = null;
      if (alive.current) { setLoading(false); setRefreshing(false); }
    });
    inFlight.current = task;
    return task;
  }, [doctorId]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - lastLoadedAt.current > STALE_AFTER_MS) void run();
  }, [run]));

  const refresh = useCallback(async () => { setRefreshing(true); await run(); }, [run]);
  return { result, loading, refreshing, refresh };
}
