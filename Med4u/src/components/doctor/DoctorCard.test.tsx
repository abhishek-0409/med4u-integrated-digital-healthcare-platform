import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Doctor } from "../../types/doctor";
import { formatExperience, formatFee } from "../../utils/helpers";
import { DoctorCard } from "./DoctorCard";

jest.mock("./DoctorPortrait", () => ({ DoctorPortrait: () => null }));

const base: Doctor = {
  id: "d1",
  name: "Fixture Person",
  specialization: "Cardiology",
  experienceYears: 12,
  bio: null,
  consultationFee: 700,
  languages: [],
  rating: 0,
  reviewCount: 0,
  isVerified: false,
  isDemo: false,
  avatarUrl: null,
  gender: null,
  clinicName: null,
  qualifications: ["MBBS"],
  city: null,
  consultationMode: "BOTH",
  isAvailableToday: false,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("formatters for missing data", () => {
  it("never turns a missing fee or experience into a number", () => {
    expect(formatFee(null)).toBe("Not provided");
    expect(formatFee(700)).toBe("₹700");
    expect(formatExperience(null)).toBe("Not provided");
    expect(formatExperience(1, true)).toBe("1 year");
    expect(formatExperience(12)).toBe("12 yrs");
  });
});

describe("DoctorCard", () => {
  it("labels demo doctors and never shows a Verified mark on them", () => {
    render(<DoctorCard doctor={{ ...base, isDemo: true }} />);
    expect(screen.getByText("Demo profile")).toBeTruthy();
    expect(screen.queryByText("Verified")).toBeNull();
  });

  it("labels a staging test doctor and never shows Verified on it", () => {
    render(<DoctorCard doctor={{ ...base, isStagingFixture: true }} />);
    expect(screen.getByText("Staging test profile")).toBeTruthy();
    expect(screen.queryByText("Verified")).toBeNull();
    expect(screen.queryByText("Demo profile")).toBeNull();
  });

  it("shows Verified only for verified real doctors", () => {
    const { rerender } = render(<DoctorCard doctor={{ ...base, isVerified: true }} />);
    expect(screen.getByText("Verified")).toBeTruthy();
    rerender(<DoctorCard doctor={{ ...base, isVerified: false }} />);
    expect(screen.queryByText("Verified")).toBeNull();
    expect(screen.queryByText("Demo profile")).toBeNull();
  });

  it("shows Not provided for a missing fee and disables booking", () => {
    const onBook = jest.fn();
    render(<DoctorCard doctor={{ ...base, consultationFee: null, experienceYears: null }} onBookNow={onBook} />);
    expect(screen.getByText("Not provided")).toBeTruthy();
    fireEvent.press(screen.getByLabelText(`Book appointment with ${base.name}`));
    expect(onBook).not.toHaveBeenCalled();
  });

  it("allows booking when the fee is known", () => {
    const onBook = jest.fn();
    render(<DoctorCard doctor={base} onBookNow={onBook} />);
    fireEvent.press(screen.getByLabelText(`Book appointment with ${base.name}`));
    expect(onBook).toHaveBeenCalledTimes(1);
  });
});
