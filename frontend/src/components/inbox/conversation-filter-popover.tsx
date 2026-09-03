"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { AdvancedFilters } from "@/hooks/use-conversation-filters";
import { useUsers } from "@/hooks/use-users";
import { useLabelList } from "@/hooks/use-labels";
import { Input } from "@/components/ui/input";

interface ConversationFilterPopoverProps {
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function ConversationFilterPopover({
  filters,
  onFiltersChange,
}: ConversationFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const { data: users } = useUsers();
  const { data: labels } = useLabelList();

  const handleFilterChange = (key: keyof AdvancedFilters, value: string | null | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-bg px-3 text-sm font-medium text-muted hover:text-text">
        <Settings2 className="h-4 w-4" />
        Filters
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="space-y-4 p-4">
          {/* Agent Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Agent</Label>
            <Command>
              <CommandInput placeholder="Search agents..." />
              <CommandList>
                <CommandEmpty>No agents found.</CommandEmpty>
                <CommandGroup>
                  {users?.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={String(user.id)}
                      onSelect={(value) => handleFilterChange("agent", value)}
                    >
                      {user.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Status</Label>
            <Select
              value={filters.status || ""}
              onValueChange={(value) => handleFilterChange("status", value)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select status..." />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Priority</Label>
            <Select
              value={filters.priority || ""}
              onValueChange={(value) => handleFilterChange("priority", value)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select priority..." />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Last activity</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Input
                  type="date"
                  value={filters.dateRange?.from ? toDateInputValue(filters.dateRange.from) : ""}
                  onChange={(e) => {
                    const from = e.target.value ? new Date(`${e.target.value}T00:00:00`) : undefined;
                    onFiltersChange({
                      ...filters,
                      dateRange:
                        from || filters.dateRange?.to
                          ? { from: from ?? filters.dateRange!.from, to: filters.dateRange?.to ?? new Date() }
                          : undefined,
                    });
                  }}
                  aria-label="From date"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Input
                  type="date"
                  value={filters.dateRange?.to ? toDateInputValue(filters.dateRange.to) : ""}
                  onChange={(e) => {
                    const to = e.target.value ? new Date(`${e.target.value}T00:00:00`) : undefined;
                    onFiltersChange({
                      ...filters,
                      dateRange:
                        to || filters.dateRange?.from
                          ? { from: filters.dateRange?.from ?? new Date(0), to: to ?? filters.dateRange!.to }
                          : undefined,
                    });
                  }}
                  aria-label="To date"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Label Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Label</Label>
            <Command>
              <CommandInput placeholder="Search labels..." />
              <CommandList>
                <CommandEmpty>No labels found.</CommandEmpty>
                <CommandGroup>
                  {labels?.map((label) => (
                    <CommandItem
                      key={label.id}
                      value={label.name}
                      onSelect={(value) => handleFilterChange("label", value)}
                    >
                      {label.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              onFiltersChange({});
              setOpen(false);
            }}
          >
            Clear Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
