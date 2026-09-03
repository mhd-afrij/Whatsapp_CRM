import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { DashboardFilters } from "./dashboard-filters";
import { DashboardKpiCard } from "./dashboard-kpi-card";

describe("DashboardKpiCard", () => {
  it("renders the metric, supporting context, icon, and trend when provided", () => {
    render(<DashboardKpiCard label="Pipeline value" value="$12,500" supportingText="Current open deal value" icon={Activity} tone="violet" trend={[10, 14, 18]} />);

    expect(screen.getByText("Pipeline value")).toBeInTheDocument();
    expect(screen.getByText("$12,500")).toBeInTheDocument();
    expect(screen.getByText("Current open deal value")).toBeInTheDocument();
    expect(document.querySelector("polyline")).toBeInTheDocument();
  });
});

describe("DashboardFilters", () => {
  it("renders date and owner filters and emits changes", () => {
    const onFromChange = vi.fn();
    const onToChange = vi.fn();
    const onAgentChange = vi.fn();

    render(
      <DashboardFilters
        from="2026-08-01"
        to="2026-08-24"
        today="2026-08-24"
        agentUserId=""
        users={[{ id: 7, name: "Alex Agent" }]}
        canViewUsers
        onFromChange={onFromChange}
        onToChange={onToChange}
        onAgentChange={onAgentChange}
      />
    );

    expect(screen.getByDisplayValue("2026-08-01")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alex Agent" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("");
  });
});
