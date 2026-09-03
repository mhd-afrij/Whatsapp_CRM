import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "../../utils/formatDate.js";

export function Tabs({ tabs, defaultTab, activeTab, onChange, className }) {
  const [internalActive, setInternalActive] = useState(defaultTab ?? tabs[0]?.id);
  const tabRefs = useRef({});

  useEffect(() => {
    if (activeTab !== undefined) {
      setInternalActive(activeTab);
    }
  }, [activeTab]);

  const active = activeTab !== undefined ? activeTab : internalActive;

  const handleChange = useCallback(
    (id) => {
      if (activeTab === undefined) {
        setInternalActive(id);
      }
      onChange?.(id);
    },
    [activeTab, onChange]
  );

  const handleKeyDown = useCallback(
    (e, id) => {
      const idx = tabs.findIndex((t) => t.id === id);
      let next;

      if (e.key === "ArrowRight") {
        next = tabs[(idx + 1) % tabs.length];
      } else if (e.key === "ArrowLeft") {
        next = tabs[(idx - 1 + tabs.length) % tabs.length];
      } else {
        return;
      }

      e.preventDefault();
      handleChange(next.id);
      tabRefs.current[next.id]?.focus();
    },
    [tabs, handleChange]
  );

  const activeTabItem = tabs.find((t) => t.id === active);

  return (
    <div className={className}>
      <div className="flex gap-0 border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el; }}
            role="tab"
            aria-selected={active === tab.id}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              active === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
            onClick={() => handleChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-4" role="tabpanel">
        {activeTabItem?.content}
      </div>
    </div>
  );
}
