"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  defaultCountry,
  detectCountryFromNumber,
  type Country,
} from "@/lib/countries";
import { CountryFlag } from "@/components/contacts/country-flag";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PhoneNumberInputProps {
  id?: string;
  /** The national part of the number (without the dialing code). */
  value: string;
  /** Currently selected dialing code (controlled by the parent, e.g. "94"). */
  dialCode: string;
  /** Called when the user picks a different country from the dropdown. */
  onDialCodeChange: (dialCode: string) => void;
  /** Called with the national number on every edit. */
  onChange: (nationalNumber: string) => void;
  hasError?: boolean;
}

/**
 * Phone input with a country flag + dialing code dropdown (searchable). The
 * dropdown holds the country code; the text field holds the national number.
 * Typing a full international number ("+44 7…") auto-detects the country and
 * strips the code into the dropdown, WhatsApp-style. The parent is the single
 * source of truth for both the value and the dialing code, so this component
 * has no internal form state beyond the open/closed dropdown.
 */
export function PhoneNumberInput({
  id,
  value,
  dialCode,
  onDialCodeChange,
  onChange,
  hasError,
}: PhoneNumberInputProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const country = COUNTRIES.find((c) => c.dial === dialCode) ?? defaultCountry();

  const handleInputChange = (raw: string) => {
    const detected = detectCountryFromNumber(raw);
    if (detected) {
      onDialCodeChange(detected.country.dial);
      onChange(detected.national);
    } else {
      onChange(raw);
    }
  };

  const handleSelect = (next: Country) => {
    setMenuOpen(false);
    onDialCodeChange(next.dial);
  };

  return (
    <div className="flex">
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          type="button"
          aria-label={`Country code: ${country.name} (+${country.dial})`}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-bg px-2.5 text-sm text-text outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary",
            hasError && "border-danger focus:border-danger focus:ring-danger"
          )}
        >
          <CountryFlag code={country.code} className="h-4 w-6 shrink-0" />
          <span className="tabular-nums">+{country.dial}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 overflow-hidden p-0">
          <Command>
            <CommandInput placeholder="Search country or code…" />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} ${c.dial} ${c.code}`}
                    onSelect={() => handleSelect(c)}
                  >
                    <CountryFlag code={c.code} className="h-4 w-6 shrink-0" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums text-muted">+{c.dial}</span>
                    {c.code === country.code && <Check className="h-4 w-4 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <input
        id={id}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="712345678"
        className={cn(
          "w-full rounded-r-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
          hasError && "border-danger focus:border-danger focus:ring-danger"
        )}
      />
    </div>
  );
}
