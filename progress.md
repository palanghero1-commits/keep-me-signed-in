Original prompt: now make sure the siren is loud siren or nuclear siren

- Updated the alarm oscillator profile in `src/components/DutySchedule.tsx` from short high beeps to a longer sweeping siren cycle with layered waveforms.
- Kept the existing voice prompt, vibration, and cleanup behavior intact while increasing the alarm presence.
- Wrapped `startAlarmSound` in `useCallback` so the alarm polling effect no longer carries a missing-dependency warning.
- TODO: project lint still has unrelated existing errors in `src/components/ui/command.tsx`, `src/components/ui/textarea.tsx`, and `tailwind.config.ts`.
