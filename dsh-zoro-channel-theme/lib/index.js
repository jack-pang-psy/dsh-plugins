import z from '@deepseek-ai/schemastery';
export const Config = z.object({
  suit: z.union(['santoryu', 'enma', 'native']).default('santoryu').volatile(),
  portrait: z.boolean().default(true).volatile(),
});
export function apply(ctx) {
  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.effect(() => settingsCtx.settings.configure({auto: false}, ctx.fiber));
  });
}
