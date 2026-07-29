import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type MultiSelectFilterOption = {
  value: string;
  label: string;
};

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {selected.length > 0 ? `${label} (${selected.length})` : label}
          <ChevronDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-1 py-1 text-sm">選択肢がありません</p>
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {options.map((option) => (
              <label
                key={option.value}
                className="hover:bg-accent flex items-center gap-2 rounded-sm px-1 py-1.5 text-sm"
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={(checked) => toggle(option.value, checked === true)}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
