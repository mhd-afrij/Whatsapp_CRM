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

const LEAD_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "disqualified", label: "Disqualified" },
  { value: "converted", label: "Converted" },
];

export function ConversationFilterPopover({
  filters,
  onFiltersChange,
}: ConversationFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const { data: users } = useUsers();
  const { data: labels } = useLabelList();

  const handleFilterChange = (key: keyof AdvancedFilters, value: any) => {
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

          {/* Lead Status Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Lead Status</Label>
            <Select
              value={filters.leadStatus || ""}
              onValueChange={(value) => handleFilterChange("leadStatus", value)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select lead status..." />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
