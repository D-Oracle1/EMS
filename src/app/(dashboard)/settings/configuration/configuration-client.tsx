'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { SlidersHorizontal, Save, RotateCcw, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getSystemConfig,
  updateSystemConfig,
  resetSystemConfig,
} from '@/actions/admin.actions';
import type { SessionUser } from '@/types';

interface ConfigurationClientProps {
  user: SessionUser;
}

interface Setting {
  key: string;
  label: string;
  description: string;
  dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'TIME' | 'JSON';
  value: string;
  defaultValue: string;
  isOverridden: boolean;
  isEditable: boolean;
  isSecret: boolean;
  updatedAt: Date | null;
}

interface Category {
  category: string;
  settings: Setting[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ORGANISATION: 'Organisation',
  ATTENDANCE: 'Attendance',
  LEAVE: 'Leave',
  PAYROLL: 'Payroll',
  SECURITY: 'Security',
  OPERATIONS: 'Operations',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ConfigurationClient({ user }: ConfigurationClientProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [overriddenCount, setOverriddenCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const canManage = user.permissions.includes('SYSTEM:CONFIG_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const data = await getSystemConfig();
        setCategories(data.categories as Category[]);
        setOverriddenCount(data.overriddenCount);
        const initial: Record<string, string> = {};
        for (const category of data.categories) {
          for (const setting of category.settings) initial[setting.key] = setting.value;
        }
        setDrafts(initial);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load configuration');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  const allSettings = useMemo(
    () => categories.flatMap((c) => c.settings),
    [categories]
  );

  const changed = useMemo(
    () => allSettings.filter((s) => drafts[s.key] !== undefined && drafts[s.key] !== s.value),
    [allSettings, drafts]
  );

  function save() {
    if (changed.length === 0) return;
    setSaving(true);
    startTransition(async () => {
      const result = await updateSystemConfig(
        changed.map((s) => ({ key: s.key, value: drafts[s.key] }))
      );
      setSaving(false);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    });
  }

  function reset(setting: Setting) {
    startTransition(async () => {
      const result = await resetSystemConfig(setting.key);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to reset the setting');
      }
    });
  }

  function toggleWorkDay(key: string, day: number) {
    let days: number[];
    try {
      days = JSON.parse(drafts[key] ?? '[]');
      if (!Array.isArray(days)) days = [];
    } catch {
      days = [];
    }
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    setDrafts({ ...drafts, [key]: JSON.stringify(next) });
  }

  function renderInput(setting: Setting) {
    const value = drafts[setting.key] ?? setting.value;
    const disabled = !canManage || !setting.isEditable || setting.isSecret;

    // The working-days array gets a dedicated day picker.
    if (setting.key === 'hr.workDays') {
      let days: number[] = [];
      try {
        days = JSON.parse(value);
        if (!Array.isArray(days)) days = [];
      } catch {
        days = [];
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {DAY_NAMES.map((name, index) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={days.includes(index) ? 'default' : 'outline'}
              onClick={() => toggleWorkDay(setting.key, index)}
              disabled={disabled}
              className="h-8 w-12 px-0 text-xs"
            >
              {name}
            </Button>
          ))}
        </div>
      );
    }

    if (setting.dataType === 'BOOLEAN') {
      return (
        <Switch
          checked={value === 'true'}
          onCheckedChange={(checked) =>
            setDrafts({ ...drafts, [setting.key]: checked ? 'true' : 'false' })
          }
          disabled={disabled}
          aria-label={setting.label}
        />
      );
    }

    return (
      <Input
        id={setting.key}
        type={setting.dataType === 'NUMBER' ? 'number' : setting.dataType === 'TIME' ? 'time' : 'text'}
        value={value}
        onChange={(e) => setDrafts({ ...drafts, [setting.key]: e.target.value })}
        disabled={disabled}
        className={setting.dataType === 'NUMBER' ? 'max-w-[200px] tabular-nums' : ''}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
              Settings
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">System Configuration</h1>
          <p className="text-muted-foreground">
            Runtime settings the platform reads directly — no redeploy needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changed.length > 0 && (
            <Badge variant="warning">{changed.length} unsaved</Badge>
          )}
          <Button onClick={save} disabled={!canManage || changed.length === 0 || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          {overriddenCount} of {allSettings.length} settings differ from their default. Changes take
          effect within 30 seconds across the application.
        </span>
      </div>

      {categories.length > 0 && (
        <Tabs defaultValue={categories[0].category}>
          <TabsList className="flex-wrap">
            {categories.map((category) => (
              <TabsTrigger key={category.category} value={category.category}>
                {CATEGORY_LABELS[category.category] ?? category.category}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((category) => (
            <TabsContent key={category.category} value={category.category} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <SlidersHorizontal className="h-5 w-5" />
                    {CATEGORY_LABELS[category.category] ?? category.category}
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {category.settings.map((setting) => {
                    const isChanged =
                      drafts[setting.key] !== undefined && drafts[setting.key] !== setting.value;

                    return (
                      <div
                        key={setting.key}
                        className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr,320px] md:items-start"
                      >
                        <div className="min-w-0">
                          <Label htmlFor={setting.key} className="flex flex-wrap items-center gap-2">
                            {setting.label}
                            {setting.isOverridden && (
                              <Badge variant="secondary" className="text-[10px]">
                                customised
                              </Badge>
                            )}
                            {isChanged && (
                              <Badge variant="warning" className="text-[10px]">
                                unsaved
                              </Badge>
                            )}
                          </Label>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {setting.description}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {setting.key} · default: {setting.defaultValue || '(empty)'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">{renderInput(setting)}</div>
                          {setting.isOverridden && canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => reset(setting)}
                              disabled={isPending}
                              title="Reset to default"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {categories.length === 0 && !isPending && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No configuration available.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
