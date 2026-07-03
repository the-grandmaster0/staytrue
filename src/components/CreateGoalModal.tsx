import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { sanitize, sanitizeTrunc } from '../lib/sanitize';
import { useAuthStore } from '../store/useAuthStore';
import {
  X, ChevronRight, ChevronLeft,
  Dumbbell, BookOpen, Heart, Briefcase, Coins, Sparkles, Check, Loader2,
} from 'lucide-react';

interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CATEGORIES = [
  { value: 'fitness',      label: 'Fitness',      icon: Dumbbell,  color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
  { value: 'learning',     label: 'Learning',     icon: BookOpen,  color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { value: 'mindfulness',  label: 'Mindfulness',  icon: Heart,     color: 'text-teal-500 bg-teal-500/10 border-teal-500/20' },
  { value: 'finance',      label: 'Finance',      icon: Coins,     color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  { value: 'career',       label: 'Career',       icon: Briefcase, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  { value: 'other',        label: 'Other',        icon: Sparkles,  color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
];

export const FREQUENCIES = [
  { value: 'daily',          label: 'Daily' },
  { value: 'three_per_week', label: '3× per week' },
  { value: 'weekly',         label: 'Weekly' },
];

const step1Schema = z.object({
  title: z.string().min(1, 'Title is required').max(80, 'Max 80 characters'),
  category: z.enum(['fitness', 'learning', 'mindfulness', 'finance', 'career', 'other']),
  description: z.string().max(300, 'Max 300 characters').optional(),
});
const step2Schema = z.object({
  frequency: z.enum(['daily', 'three_per_week', 'weekly']),
  targetDate: z.string().optional().refine((val) => {
    if (!val) return true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(val) >= today;
  }, { message: 'Date must be today or in the future' }),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;

export const CreateGoalModal: React.FC<CreateGoalModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { title: '', category: 'fitness', description: '' },
  });
  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { frequency: 'daily', targetDate: '' },
  });

  const s1 = step1Form.watch();
  const s2 = step2Form.watch();

  const handleNext = async () => {
    if (step === 1 && await step1Form.trigger()) setStep(2);
    else if (step === 2 && await step2Form.trigger()) setStep(3);
  };

  const handleClose = () => {
    step1Form.reset(); step2Form.reset(); setStep(1); onClose();
  };

  const createGoalMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.from('goals').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onMutate: async (newGoalData) => {
      await queryClient.cancelQueries({ queryKey: ['goals', user?.id] });
      const prev = queryClient.getQueryData(['goals', user?.id]);
      const optimistic = { id: crypto.randomUUID(), ...newGoalData, status: 'active', created_at: new Date().toISOString() };
      queryClient.setQueriesData({ queryKey: ['goals', user?.id] }, (old: any) => {
        if (!old) return { data: [optimistic], count: 1 };
        if (old.data) return { ...old, data: [optimistic, ...old.data].slice(0, 10), count: (old.count || 0) + 1 };
        return [optimistic, ...old];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['goals', user?.id], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', user?.id] });
      handleClose();
    },
  });

  const onSubmit = () => {
    if (!user) return;
    createGoalMutation.mutate({
      title: sanitizeTrunc(s1.title, 80),
      description: s1.description ? sanitizeTrunc(s1.description, 300) : null,
      category: sanitize(s1.category),
      frequency: sanitize(s2.frequency),
      target_date: s2.targetDate || null,
      user_id: user.id,
      status: 'active',
    });
  };

  if (!isOpen) return null;

  const catMeta = CATEGORIES.find((c) => c.value === s1.category);
  const CatIcon = catMeta?.icon || Sparkles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-app-panel border border-app-border rounded-2xl overflow-hidden flex flex-col animate-slide-up shadow-[var(--shadow)]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-app-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
              {step === 1 ? 'Create a goal' : step === 2 ? 'Set schedule' : 'Review & confirm'}
            </h2>
            <p className="text-xs text-app-text-secondary mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-app-text-secondary hover:text-app-text-body hover:bg-app-accent-bg transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-app-border">
          <div className="h-full bg-app-accent transition-all duration-300 rounded-none" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[62vh] space-y-5">
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-app-text-body mb-1.5">Goal title</label>
                <input
                  type="text" maxLength={80} {...step1Form.register('title')} placeholder="e.g. Run 3x a week"
                  className={`input-field w-full px-4 py-2.5 text-sm ${step1Form.formState.errors.title ? 'border-red-500/60' : ''}`}
                />
                <div className="flex justify-between mt-1">
                  {step1Form.formState.errors.title
                    ? <p className="text-xs text-red-400">{step1Form.formState.errors.title.message}</p>
                    : <span />}
                  <span className="text-xs text-app-text-dim">{(s1.title || '').length}/80</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-app-text-body mb-2">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const selected = s1.category === cat.value;
                    return (
                      <button
                        key={cat.value} type="button"
                        onClick={() => step1Form.setValue('category', cat.value as any)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-medium text-left transition-all cursor-pointer ${
                          selected ? 'border-app-border-active bg-app-accent-bg text-app-text-primary' : 'border-app-border bg-app-bg hover:border-app-border-active/50 text-app-text-secondary'
                        }`}
                      >
                        <span className={`p-1.5 rounded-lg border ${cat.color}`}><Icon className="h-3.5 w-3.5" /></span>
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-app-text-body mb-1.5">
                  Description <span className="text-app-text-dim font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3} maxLength={300} {...step1Form.register('description')}
                  placeholder="What does success look like for this goal?"
                  className="input-field w-full px-4 py-2.5 text-sm resize-none"
                />
                <p className="text-xs text-app-text-dim text-right mt-1">{(s1.description || '').length}/300</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-app-text-body mb-2">How often?</label>
                <div className="space-y-2">
                  {FREQUENCIES.map((freq) => {
                    const selected = s2.frequency === freq.value;
                    return (
                      <button
                        key={freq.value} type="button"
                        onClick={() => step2Form.setValue('frequency', freq.value as any)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                          selected ? 'border-app-border-active bg-app-accent-bg text-app-text-primary' : 'border-app-border bg-app-bg hover:border-app-border-active/50 text-app-text-secondary'
                        }`}
                      >
                        {freq.label}
                        <div className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center ${selected ? 'border-app-border-active bg-app-accent' : 'border-app-border'}`}>
                          {selected && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-app-text-body mb-1.5">
                  Target date <span className="text-app-text-dim font-normal">(optional)</span>
                </label>
                <input
                  type="date" {...step2Form.register('targetDate')}
                  className={`input-field w-full px-4 py-2.5 text-sm ${step2Form.formState.errors.targetDate ? 'border-red-500/60' : ''}`}
                />
                {step2Form.formState.errors.targetDate && (
                  <p className="mt-1 text-xs text-red-400">{step2Form.formState.errors.targetDate.message}</p>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-app-bg rounded-xl border border-app-border p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${catMeta?.color}`}>
                    <CatIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-app-text-secondary">Category</p>
                    <p className="text-sm font-semibold text-app-text-body">{catMeta?.label}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-app-text-secondary mb-0.5">Goal</p>
                  <p className="text-base font-semibold text-app-text-body">{s1.title}</p>
                  {s1.description && <p className="text-sm text-app-text-secondary mt-1 leading-relaxed">{s1.description}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-app-border">
                  <div>
                    <p className="text-xs text-app-text-secondary mb-0.5">Frequency</p>
                    <p className="text-sm font-semibold text-app-text-body">{FREQUENCIES.find((f) => f.value === s2.frequency)?.label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-app-text-secondary mb-0.5">Deadline</p>
                    <p className="text-sm font-semibold text-app-text-body">
                      {s2.targetDate ? new Date(s2.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-app-accent-bg border border-app-border-active/20 text-sm text-app-text-primary">
                Everything looks good! Ready to create your goal?
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-app-border flex justify-between gap-3">
          <button
            onClick={() => setStep((s) => s - 1)}
            className={`btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm cursor-pointer ${step === 1 ? 'invisible' : ''}`}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          {step < 3 ? (
            <button onClick={handleNext} className="btn-primary flex items-center gap-1.5 px-5 py-2 text-sm cursor-pointer ml-auto">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={createGoalMutation.isPending}
              className="btn-primary flex items-center gap-2 px-6 py-2 text-sm cursor-pointer ml-auto disabled:opacity-50"
            >
              {createGoalMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : 'Create goal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
