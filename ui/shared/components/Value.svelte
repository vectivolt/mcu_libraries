<!-- Big numeric readout. Tabular-nums so the value doesn't jiggle as digits change. -->
<script>
  let { value = '—', unit = '', size = 'lg' } = $props();
  const sizes = { sm: 'text-2xl', md: 'text-[28px]', lg: 'text-[34px]', xl: 'text-[48px]' };
</script>
<div class="joule-value {sizes[size]}">
  <span class="num">{value}</span>{#if unit}<span class="u">{unit}</span>{/if}
</div>

<style>
.joule-value {
  font-weight: 300;
  line-height: 1.02;
  letter-spacing: -1px;
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum","ss01";
}
.u {
  font-size: .45em;
  color: var(--color-muted);
  margin-left: .35em;
  font-weight: 500;
  letter-spacing: 0;
  vertical-align: .18em;
}
</style>
