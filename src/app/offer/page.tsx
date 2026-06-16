'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  TrendingUp,
  AlertTriangle,
  Star,
  Zap,
  Target,
  Loader2,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  OfferPredictionResult,
  OfferFactor,
  Level,
  CompanyTier,
} from '@/lib/offer/types';

const LEVELS: Level[] = ['校招', 'P5', 'P6', 'P7', 'P8'];
const COMPANY_TIERS: CompanyTier[] = ['BAT/TMD', '独角兽', '中型', 'Startup', '外企'];

const FACTOR_STATUS_STYLES: Record<string, { icon: string; color: string }> = {
  positive: { icon: '🟢', color: 'text-emerald-600' },
  neutral: { icon: '🟡', color: 'text-amber-600' },
  negative: { icon: '🔴', color: 'text-red-600' },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

interface FormData {
  level: Level;
  yearsOfExperience: string;
  matchScore: string;
  interviewScore: string;
  companyTier: CompanyTier;
  jdLevel: string;
  jdMinYears: string;
}

const INITIAL_FORM: FormData = {
  level: 'P6',
  yearsOfExperience: '',
  matchScore: '',
  interviewScore: '',
  companyTier: 'BAT/TMD',
  jdLevel: '',
  jdMinYears: '',
};

function getProbabilityColor(p: number): string {
  if (p >= 0.7) return 'text-emerald-500';
  if (p >= 0.4) return 'text-amber-500';
  return 'text-red-500';
}

function getProbabilityBg(p: number): string {
  if (p >= 0.7) return 'bg-emerald-500';
  if (p >= 0.4) return 'bg-amber-500';
  return 'bg-red-500';
}

function getProbabilityRing(p: number): string {
  if (p >= 0.7) return 'stroke-emerald-500';
  if (p >= 0.4) return 'stroke-amber-500';
  return 'stroke-red-500';
}

export default function OfferPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [result, setResult] = useState<OfferPredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/offer/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'anonymous',
          level: form.level,
          yearsOfExperience: parseFloat(form.yearsOfExperience) || 0,
          matchScore: form.matchScore ? parseFloat(form.matchScore) : undefined,
          interviewScore: form.interviewScore ? parseFloat(form.interviewScore) : undefined,
          companyInfo: {
            name: '',
            tier: form.companyTier,
          },
          jdLevel: form.jdLevel || undefined,
          jdMinYears: form.jdMinYears ? parseFloat(form.jdMinYears) : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `请求失败 (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const probabilityPct = result ? Math.round(result.probability * 100) : 0;
  const probabilityColor = result ? getProbabilityColor(result.probability) : '';

  // Circle gauge dimensions
  const gaugeRadius = 60;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = result
    ? gaugeCircumference - (result.probability * gaugeCircumference)
    : gaugeCircumference;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href="/" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Offer 概率分析</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Input Form */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                输入参数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Level */}
                <div className="space-y-1.5">
                  <Label htmlFor="level">级别选择</Label>
                  <Select
                    value={form.level}
                    onValueChange={(v) => updateField('level', v)}
                  >
                    <SelectTrigger id="level" className="w-full">
                      <SelectValue placeholder="选择级别" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Years of Experience */}
                <div className="space-y-1.5">
                  <Label htmlFor="yearsOfExperience">工作年限</Label>
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    placeholder="如：3"
                    value={form.yearsOfExperience}
                    onChange={(e) => updateField('yearsOfExperience', e.target.value)}
                  />
                </div>

                {/* Match Score */}
                <div className="space-y-1.5">
                  <Label htmlFor="matchScore">简历匹配分 (0-10)</Label>
                  <Input
                    id="matchScore"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="如：7.5"
                    value={form.matchScore}
                    onChange={(e) => updateField('matchScore', e.target.value)}
                  />
                </div>

                {/* Interview Score */}
                <div className="space-y-1.5">
                  <Label htmlFor="interviewScore">
                    面试分 (0-10)
                    <span className="text-xs text-muted-foreground ml-1">可选</span>
                  </Label>
                  <Input
                    id="interviewScore"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="如：6.0"
                    value={form.interviewScore}
                    onChange={(e) => updateField('interviewScore', e.target.value)}
                  />
                </div>

                {/* Company Tier */}
                <div className="space-y-1.5">
                  <Label htmlFor="companyTier">公司梯队</Label>
                  <Select
                    value={form.companyTier}
                    onValueChange={(v) => updateField('companyTier', v)}
                  >
                    <SelectTrigger id="companyTier" className="w-full">
                      <SelectValue placeholder="选择梯队" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_TIERS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* JD Level */}
                <div className="space-y-1.5">
                  <Label htmlFor="jdLevel">
                    JD 级别
                    <span className="text-xs text-muted-foreground ml-1">可选</span>
                  </Label>
                  <Select
                    value={form.jdLevel}
                    onValueChange={(v) => updateField('jdLevel', v)}
                  >
                    <SelectTrigger id="jdLevel" className="w-full">
                      <SelectValue placeholder="选择 JD 级别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">不限</SelectItem>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* JD Min Years */}
                <div className="space-y-1.5">
                  <Label htmlFor="jdMinYears">
                    JD 要求年限
                    <span className="text-xs text-muted-foreground ml-1">可选</span>
                  </Label>
                  <Input
                    id="jdMinYears"
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    placeholder="如：3"
                    value={form.jdMinYears}
                    onChange={(e) => updateField('jdMinYears', e.target.value)}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" />
                      开始分析
                    </>
                  )}
                </Button>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="lg:col-span-3 space-y-6">
            {/* Empty state */}
            {!result && !loading && !error && (
              <Card>
                <CardContent className="py-16 text-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    填写左侧参数后，点击「开始分析」查看 Offer 概率预测
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Loading state */}
            {loading && (
              <Card>
                <CardContent className="py-16 text-center">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">正在分析中...</p>
                </CardContent>
              </Card>
            )}

            {/* Prediction Result */}
            {result && (
              <>
                {/* Probability Gauge */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center">
                      {/* Circular gauge */}
                      <div className="relative w-40 h-40 mb-4">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                          <circle
                            cx="70"
                            cy="70"
                            r={gaugeRadius}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="10"
                            className="text-muted/20"
                          />
                          <circle
                            cx="70"
                            cy="70"
                            r={gaugeRadius}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="10"
                            strokeLinecap="round"
                            strokeDasharray={gaugeCircumference}
                            strokeDashoffset={gaugeOffset}
                            className={`${getProbabilityRing(result.probability)} transition-all duration-1000 ease-out`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-3xl font-bold ${probabilityColor}`}>
                            {probabilityPct}%
                          </span>
                          <span className="text-xs text-muted-foreground">Offer Probability</span>
                        </div>
                      </div>

                      {/* Confidence & Interval */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          Confidence: {result.confidence.toFixed(2)}
                        </span>
                        <span className="text-border">|</span>
                        <span>
                          区间: [{Math.round(result.predictionInterval.low * 100)}%, {Math.round(result.predictionInterval.high * 100)}%]
                        </span>
                      </div>

                      {/* Probability bar */}
                      <div className="w-full mt-4">
                        <Progress
                          value={result.probability * 100}
                          className={`h-3 ${getProbabilityBg(result.probability)}`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Factor Breakdown */}
                {result.breakdown.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        因子拆解
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 font-medium text-muted-foreground">因子</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">权重</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">评分</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">贡献</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.breakdown.map((factor: OfferFactor, idx: number) => {
                              const style = FACTOR_STATUS_STYLES[factor.status] ?? FACTOR_STATUS_STYLES.neutral;
                              return (
                                <tr key={idx} className="border-b border-border/50">
                                  <td className="py-2.5">
                                    <span className="text-foreground">{factor.factor}</span>
                                  </td>
                                  <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                                    {Math.round(factor.weight * 100)}%
                                  </td>
                                  <td className="py-2.5 text-right text-foreground tabular-nums">
                                    {(factor.score * 10).toFixed(1)}
                                  </td>
                                  <td className={`py-2.5 text-right tabular-nums ${style.color}`}>
                                    {style.icon} {(factor.contribution * 100).toFixed(1)}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top Risks */}
                {result.topRisks.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        Top 风险
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {result.topRisks.map((risk, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {risk.risk}
                              </span>
                              <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                                -{risk.impact}%
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {risk.howToMitigate}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Top Strengths */}
                {result.topStrengths.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        Top 优势
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {result.topStrengths.map((strength, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <Star className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-foreground">
                              {strength.strength}
                            </span>
                            <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-600">
                              +{strength.impact}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Improvement Actions */}
                {result.improvementActions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        改进建议
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {result.improvementActions.map((action, idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {action.action}
                            </span>
                            <Badge className={`text-xs ${DIFFICULTY_COLORS[action.difficulty] ?? ''}`}>
                              {DIFFICULTY_LABELS[action.difficulty] ?? action.difficulty}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              潜在提升: +{Math.round(action.potentialLift * 100)}%
                            </span>
                            <span>预计耗时: {action.estimatedHours}h</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Trace */}
                <div className="text-xs text-muted-foreground text-center pb-8">
                  模型：{result.modelVersion} · {result.llmTrace.modelUsed}
                  {' · '}Token：{result.llmTrace.inputTokens}+{result.llmTrace.outputTokens}
                  {' · '}耗时：{result.llmTrace.totalLatencyMs}ms
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}