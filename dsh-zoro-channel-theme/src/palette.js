const PALETTE = {
  santoryu: {
    light: {ground:'#F3F5EE',panel:'#FCFDF9',panel2:'#E8EDE1',sidebar:'#E5EADB',ink:'#202B22',ink2:'#4D5F4B',ink3:'#64725F',line:'#D4DDCC',line2:'#BAC8B0',brand:'#38603C',brandSoft:'#DAE5CD',gold:'#A0782D',goldInk:'#FFF9EA',tangerine:'#38603C',crimson:'#A33E4B',whale:'#626095',bubble:'#E1EACF'},
    dark: {ground:'#121A16',panel:'#1C2720',panel2:'#26332A',sidebar:'#17201B',ink:'#EDF2E7',ink2:'#BCCAB3',ink3:'#96A88F',line:'#344438',line2:'#4C5E48',brand:'#A6C781',brandSoft:'#30432B',gold:'#D6BA75',goldInk:'#1E271B',tangerine:'#A6C781',crimson:'#E6949B',whale:'#B6A7D8',bubble:'#30432B'},
  },
  enma: {
    light: {ground:'#F3F1F5',panel:'#FCFBFD',panel2:'#EBE5F0',sidebar:'#E9E3EC',ink:'#282330',ink2:'#5F526C',ink3:'#796887',line:'#DDD3E4',line2:'#C6B5D2',brand:'#70508C',brandSoft:'#E5D8ED',gold:'#9A7325',goldInk:'#FFF9EA',tangerine:'#70508C',crimson:'#A33E4B',whale:'#47664C',bubble:'#E5D8ED'},
    dark: {ground:'#19151F',panel:'#241E2D',panel2:'#30273C',sidebar:'#1E1925',ink:'#F1ECF5',ink2:'#CABDD5',ink3:'#AD9ABC',line:'#40334E',line2:'#5C476D',brand:'#BE9DD8',brandSoft:'#42314F',gold:'#D6BA75',goldInk:'#261C30',tangerine:'#BE9DD8',crimson:'#E6949B',whale:'#A6C781',bubble:'#42314F'},
  },
};
function tokensFor(suit) {
  const colors = PALETTE[suit], out = {};
  for (const [token, semantic] of Object.entries(TOKEN_MAP)) {
    out[token] = {light:colors.light[semantic], dark:colors.dark[semantic]};
  }
  const pair = (l,d) => ({light:l,dark:d});
  out['--zoro-accent'] = pair(colors.light.brand,colors.dark.brand);
  out['--zoro-gold'] = pair(colors.light.gold,colors.dark.gold);
  out['--zoro-send-ink'] = pair('#FFFFFF', colors.dark.goldInk);
  out['--dsw-alias-state-success-primary'] = pair('#38603C','#A6C781');
  for (const key of ['keyword','function','string','parameter','constant','comment','punctuation','link','string-expression']) {
    const semantic = {keyword:'brand',function:'gold',string:'whale',parameter:'ink2',constant:'crimson',comment:'ink3',punctuation:'ink2',link:'brand','string-expression':'whale'}[key];
    out[`--shiki-token-${key}`] = pair(colors.light[semantic], colors.dark[semantic]);
  }
  // Cover the host's neutral ramp as well as aliases, for components that use static colors.
  const ramp = ['#FFFFFF','#F8FAF5','#F8FAF5','#F0F3EB','#E6ECDF','#DFE6D7','#D6DFCD','#C1CDB7','#AABAA0','#94A58B','#7B9072','#5D7255','#45553F','#34422F','#293626','#202C1E','#182117','#121A11','#0C120D'];
  const steps = ['00','50','60','75','100','150','200','300','400','500','600','700','750','800','850','875','900','950','1000'];
  // Enma uses the same light-to-dark structure with a restrained purple-neutral ramp.
  const purple = ['#FFFFFF','#FAF8FC','#FAF8FC','#F3EFF7','#EBE5F0','#E5DDEA','#DDD2E4','#CBBBD6','#B6A3C2','#A08BAE','#887296','#6B5778','#51405C','#403249','#34283B','#2A202F','#211925','#19131C','#120D15'];
  steps.forEach((step,i) => out[`--dsw-static-neutral-bluish-${step}`] = pair((suit === 'enma' ? purple : ramp)[i],(suit === 'enma' ? purple : ramp)[i]));
  return out;
}
