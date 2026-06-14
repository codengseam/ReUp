'use client';

// src/app/resume/_components/PrivacyToggle.tsx
// ReUp v2 Phase 5 (G3): client-side privacy mode toggle.
//
// When enabled, the resume pipeline will skip any cloud upload and the page
// shows a small "本地" badge. The underlying state lives in localStorage
// (see `@/lib/resume/privacy`); an optional deploy-time env var can also
// force it on, but that branch is read-only here.
//
// The component is controlled when `enabled` is passed; otherwise it
// manages its own state. The `onChange` callback always fires with the
// next value so the parent can re-derive page-level UI (e.g. the notice).

import { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isPrivacyMode, setPrivacyMode } from '@/lib/resume/privacy';

export interface PrivacyToggleProps {
  /** Current enabled state. If omitted, the component manages its own state. */
  enabled?: boolean;
  /** Fired with the next value whenever the user toggles the switch. */
  onChange?: (next: boolean) => void;
}

export function PrivacyToggle({ enabled, onChange }: PrivacyToggleProps = {}) {
  // Internal fallback state for the uncontrolled case.
  const [internal, setInternal] = useState<boolean>(false);
  const isControlled = typeof enabled === 'boolean';
  const value = isControlled ? (enabled as boolean) : internal;

  // The env-only branch can't be toggled off from the UI, so we render it
  // as always-on and disable the switch in that case.
  const [envLocked, setEnvLocked] = useState<boolean>(false);

  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_PRIVACY_MODE === 'local-only';
    setEnvLocked(env);
    if (!isControlled) {
      setInternal(isPrivacyMode());
    }
  }, [isControlled]);

  const onCheckedChange = (next: boolean): void => {
    if (envLocked) return; // deploy-fixed; UI cannot override
    setPrivacyMode(next);
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {value ? (
            <Lock className="w-4 h-4 text-primary" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          )}
          隐私设置
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="privacy-mode-switch"
            className="text-sm font-medium leading-none"
          >
            本地优先模式（禁用云端上传）
          </label>
          <p className="text-[11px] text-muted-foreground">
            开启后简历解析与重写全部在浏览器内进行，不会上传到服务器。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {value && (
            <Badge variant="secondary" data-testid="privacy-badge">
              本地
            </Badge>
          )}
          <Switch
            id="privacy-mode-switch"
            checked={value}
            onCheckedChange={onCheckedChange}
            disabled={envLocked}
            aria-label="本地优先模式"
          />
        </div>
      </CardContent>
    </Card>
  );
}
