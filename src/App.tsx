import { useEffect, useRef, useState, type FormEvent } from 'react'
import D3GeographicMap from './components/D3GeographicMap'
import { enrollments as staticEnrollments, etecs as staticEtecs, exemptionMetrics, options as staticOptions, snapshotSeries as staticSnapshotSeries, sourceMetadata as staticSourceMetadata, type Enrollment, type EtecPoint, type SnapshotSeries } from './data/mockData'

type Filters={regional:string;etec:string;modality:string;course:string;period:string}; type FilterKey=keyof Filters
type OfferStatus='comfortable'|'attention'|'low'
type DashboardPayload={enrollments:Enrollment[];etecs:EtecPoint[];snapshotSeries:SnapshotSeries[];sourceMetadata:typeof staticSourceMetadata}
const initialFilters:Filters={regional:'',etec:'',modality:'',course:'',period:''}; const number=new Intl.NumberFormat('pt-BR')
const apiBaseUrl=(import.meta.env.VITE_API_BASE_URL??'').replace(/\/$/,'')
const apiUrl=(path:string)=>`${apiBaseUrl}${path}`
const readJson=async<T,>(response:Response):Promise<T>=>{const text=await response.text();if(!text)return {} as T;try{return JSON.parse(text) as T}catch{throw new Error(response.ok?'O servidor respondeu em um formato inválido.':text)}}
type HistoryPoint={referenceAt:string;total:number;paid:number;unpaid:number;trainee:number;regular:number}; type ChartData=Enrollment[]&{history?:HistoryPoint[]}
const offerStatusFor=(item:Enrollment):OfferStatus=>{const demand=item.vacancies?item.paid/item.vacancies:0;return demand>=1.5?'comfortable':demand>=1?'attention':'low'}
function SelectFilter({label,value,values,onChange,etecOptions=[]}:{label:string;value:string;values:string[];onChange:(value:string)=>void;etecOptions?:EtecPoint[]}){
 const unavailable=values.length===0
 const displayLabel=label==='Etec'?'Local de oferta':label
 return <label className="filter">
<div className="filter-title">
<span>{displayLabel}</span></div>
<select value={value} disabled={unavailable} onChange={e=>onChange(e.target.value)}>
<option value="">{unavailable?'Indisponível nesta fonte':'Todos'}</option>{values.map(item=>
<option key={item} value={item}>{label==='Etec'?(etecOptions.find(etec=>etec.name===item)?.label??item):item}</option>)}</select>
</label>
}
function TrendChart({data,target}:{data:ChartData;target:number}){
 const svgRef=useRef<SVGSVGElement>(null); const [viewHeight,setViewHeight]=useState(265)
 useEffect(()=>{const svg=svgRef.current;if(!svg)return undefined;const update=()=>{if(!svg.clientWidth)return;const next=Math.max(265,Math.round(svg.clientHeight/svg.clientWidth*680));setViewHeight(current=>current===next?current:next)};const observer=new ResizeObserver(update);observer.observe(svg);update();return()=>observer.disconnect()},[])
 const plotTop=38; const plotBottom=viewHeight-38; const plotHeight=plotBottom-plotTop
 if(!data.some(item=>item.daily.length)){const history=data.history??[];const max=Math.max(...history.map(point=>point.total),1); const points=history.map((point,index)=>({point,x:history.length===1?360:70+index*580/(history.length-1),y:plotBottom-point.total/max*plotHeight*.8})); return <div className="trend">
<div className="chart-legend">
<span className="legend-paid">Snapshots reais</span>
</div>
<svg ref={svgRef} viewBox={`0 0 680 ${viewHeight}`} role="img" aria-label="Histórico disponível de inscrições">
<polyline className="chart-line" points={points.map(({x,y})=>`${x},${y}`).join(' ')}/>{points.map(({point,x,y})=>
<g key={point.referenceAt}>
<circle className="chart-dot" cx={x} cy={y} r="6">
<title>{`${new Date(point.referenceAt).toLocaleString('pt-BR')}: ${number.format(point.total)} inscritos`}</title>
</circle>
<text x={x} y={y-14} textAnchor="middle">{number.format(point.total)}</text>
<text x={x} y={viewHeight-16} textAnchor="middle">{new Date(point.referenceAt).toLocaleDateString('pt-BR')}</text>
</g>)}</svg>
<p className="chart-footnote">{history.length} snapshot{history.length===1?'':'s'} real{history.length===1?' disponível':' disponíveis'} para o recorte ativo.</p>
</div>}
 const points=Array.from({length:10},(_,index)=>({day:`Dia ${index+1}`,value:data.reduce((sum,item)=>sum+(item.daily[index]?.value??0),0)})); const max=Math.max(target,...points.map(point=>point.value),1); const pointList=points.map((point,index)=>`${72+index*65},${plotBottom-point.value/max*plotHeight}`).join(' '); const targetY=plotBottom-target/max*plotHeight
 return <div className="trend">
<div className="chart-legend">
<span className="legend-paid">Inscritos pagos</span>
<span className="legend-target">Meta prevista</span>
</div>
<svg ref={svgRef} viewBox={`0 0 680 ${viewHeight}`} role="img" aria-label="Evolucao diaria das inscricoes">
<g className="chart-grid">{[.1,.3,.5,.7,.9].map(ratio=>
<line key={ratio} x1="70" x2="650" y1={plotTop+plotHeight*ratio} y2={plotTop+plotHeight*ratio}/>)}</g>
<line className="chart-target" x1="70" x2="650" y1={targetY} y2={targetY}/>
<path className="chart-area" d={`M72 ${plotBottom} L${pointList.replaceAll(' ',' L')} L657 ${plotBottom} Z`}/>
<polyline className="chart-line" points={pointList}/>{points.map((point,index)=>
<g key={point.day}>
<circle className="chart-dot" cx={72+index*65} cy={plotBottom-point.value/max*plotHeight} r="3.4"/>
<text x={72+index*65} y={viewHeight-16} textAnchor="middle">{index+1}</text>
</g>)}</svg>
<p className="chart-footnote">Dados acumulados por dia de inscricao</p>
</div>
}
export default function App(){
 const [filters,setFilters]=useState<Filters>(initialFilters); const [selectedEtec,setSelectedEtec]=useState(''); const [geographicScope,setGeographicScope]=useState<{label:string;etecs:string[]}|null>(null); const [mapResetKey,setMapResetKey]=useState(0); const [analysisTab,setAnalysisTab]=useState<'evolution'|'regional'>('evolution'); const [statusFilter,setStatusFilter]=useState<OfferStatus|null>(null); const [dashboard,setDashboard]=useState<DashboardPayload|null>(null); const [importOpen,setImportOpen]=useState(false); const [importPassword,setImportPassword]=useState(''); const [importFile,setImportFile]=useState<File|null>(null); const [importMessage,setImportMessage]=useState(''); const [importing,setImporting]=useState(false)
 useEffect(()=>{let cancelled=false;void fetch(apiUrl('/api/dashboard-data')).then(async response=>response.ok?readJson<{snapshots?:SnapshotSeries[];etecs?:EtecPoint[];sourceMetadata?:typeof staticSourceMetadata}>(response):null).then(payload=>{if(cancelled||!payload?.snapshots?.length)return;const snapshots=payload.snapshots;setDashboard({enrollments:snapshots.at(-1)!.enrollments,etecs:payload.etecs??[],snapshotSeries:snapshots,sourceMetadata:payload.sourceMetadata??staticSourceMetadata})}).catch(()=>{});return()=>{cancelled=true}},[])
 const {enrollments,etecs,snapshotSeries,sourceMetadata}=dashboard??{enrollments:staticEnrollments,etecs:staticEtecs,snapshotSeries:staticSnapshotSeries,sourceMetadata:staticSourceMetadata}
 const dependentKeys:FilterKey[]=['regional','etec','course','period']; const valuesFor=(key:FilterKey,current:Filters,scope=geographicScope)=>{const items=enrollments.filter(item=>(!scope||scope.etecs.includes(item.etec))&&dependentKeys.every(candidate=>candidate===key||!current[candidate]||item[candidate]===current[candidate])); const validItems=(key==='course'||key==='period')?items.filter(item=>!item.isTrainee):items; return [...new Set(validItems.map(item=>item[key]))]}; const normalizeFilters=(next:Filters,preserve?:FilterKey,scope=geographicScope)=>{let normalized=next; let changed=true; while(changed){changed=false; dependentKeys.forEach(key=>{if(key!==preserve&&normalized[key]&&!valuesFor(key,normalized,scope).includes(normalized[key])){normalized={...normalized,[key]:''};changed=true}})} return normalized}; const options={regional:valuesFor('regional',filters),etec:valuesFor('etec',filters),modality:staticOptions.modality,course:valuesFor('course',filters),period:valuesFor('period',filters)}
 const updateFilter=(key:FilterKey,value:string)=>{setGeographicScope(null);setFilters(current=>normalizeFilters({...current,[key]:value},key,null));setMapResetKey(current=>current+1);if(key==='etec')setSelectedEtec(value);else setSelectedEtec('')}; const selectEtec=(etec:string)=>{const scope={label:etec,etecs:[etec]};setSelectedEtec(etec);setGeographicScope(scope);setFilters(current=>normalizeFilters({...current,etec},'etec',scope))}; const selectGeographicScope=(label:string,scopedEtecs:string[])=>{const scope={label,etecs:scopedEtecs};setSelectedEtec('');setGeographicScope(scope);setFilters(current=>normalizeFilters({...current,etec:''},undefined,scope))}; const clearGeographicScope=()=>{setSelectedEtec('');setGeographicScope(null);setFilters(current=>normalizeFilters({...current,etec:''},undefined,null))}; const clearFilters=()=>{setSelectedEtec('');setGeographicScope(null);setStatusFilter(null);setFilters(initialFilters);setMapResetKey(current=>current+1)}
 const uploadImport=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!importFile||!importPassword){setImportMessage('Informe a senha e selecione a planilha para continuar.');return}setImporting(true);setImportMessage('Validando e importando a planilha...');try{const response=await fetch(apiUrl('/api/import-inscricoes'),{method:'POST',headers:{'X-Import-Password':importPassword,'Content-Type':importFile.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-File-Name':encodeURIComponent(importFile.name)},body:importFile});const payload=await readJson<{error?:string;records?:number}>(response);if(!response.ok)throw new Error(payload.error??'Não foi possível importar a planilha.');setImportPassword('');setImportMessage(`Importação publicada com ${number.format(payload.records??0)} ofertas. Atualizando o painel...`);window.setTimeout(()=>window.location.reload(),900)}catch(error){setImportMessage(error instanceof Error?error.message:'Não foi possível importar a planilha.')}finally{setImporting(false)}}
 const matchesActiveScope=(item:Enrollment)=>Object.entries(filters).every(([key,value])=>!value||item[key as FilterKey]===value)&&(!geographicScope||geographicScope.etecs.includes(item.etec))&&(!statusFilter||(!item.isTrainee&&offerStatusFor(item)===statusFilter)); const scopedHistory=snapshotSeries.map(({referenceAt,enrollments:items})=>{const scoped=items.filter(matchesActiveScope);const paid=scoped.reduce((sum,item)=>sum+item.paid,0);const unpaid=scoped.reduce((sum,item)=>sum+item.unpaid,0);const trainee=scoped.filter(item=>item.isTrainee).reduce((sum,item)=>sum+item.paid+item.unpaid,0);return {referenceAt,total:paid+unpaid,paid,unpaid,trainee,regular:paid+unpaid-trainee}}); const data=Object.assign(enrollments.filter(matchesActiveScope),{history:scopedHistory}) as ChartData; const totals=data.reduce((r,item)=>({paid:r.paid+item.paid,unpaid:r.unpaid+item.unpaid,vacancies:r.vacancies+(item.isTrainee?0:item.vacancies),target:r.target+item.target,trainee:r.trainee+(item.isTrainee?item.paid+item.unpaid:0),regular:r.regular+(item.isTrainee?0:item.paid)}),{paid:0,unpaid:0,vacancies:0,target:0,trainee:0,regular:0}); const total=totals.paid+totals.unpaid
 const demandBands=data.filter(item=>!item.isTrainee).reduce((r,item)=>{const demand=item.vacancies?item.paid/item.vacancies:0;if(demand>=1.5)r.comfortable++;else if(demand>=1)r.attention++;else r.low++;return r},{comfortable:0,attention:0,low:0}); const regularOfferCount=demandBands.comfortable+demandBands.attention+demandBands.low; const activeEtecNames=new Set(data.map(item=>item.etec)); const activeEtecs=etecs.filter(etec=>activeEtecNames.has(etec.name)); const selectedEtecLabel=etecs.find(etec=>etec.name===selectedEtec)?.label??selectedEtec; const scope=selectedEtec?selectedEtecLabel:(geographicScope?.label??'Estado de Sao Paulo'); const geographicScopeIsMunicipality=Boolean(geographicScope?.etecs.every(name=>etecs.find(etec=>etec.name===name)?.municipality===geographicScope.label)); const performanceTable=selectedEtec?{title:'Desempenho do local de oferta',column:'Local de oferta',label:selectedEtecLabel,countLabel:'local'}:geographicScopeIsMunicipality?{title:'Desempenho do município',column:'Município',label:geographicScope!.label,countLabel:'município'}:(filters.regional||geographicScope)?{title:'Desempenho da regional',column:'Regional',label:'',countLabel:'regional'}:{title:'Desempenho por regional',column:'Regional',label:'',countLabel:'regionais'}; const kpis=[['Inscritos totais',number.format(total),`${number.format(totals.trainee)} Treineiros incluidos`,'blue'],['Inscritos pagos',number.format(totals.paid),`${total?Math.round(totals.paid/total*100):0}% do total`,'green'],['Inscritos isentos',exemptionMetrics?number.format(exemptionMetrics.inscritos_com_isencao):'N/D','fonte de isenção indisponível','purple'],['Conversao',`${total?Math.round(totals.paid/total*100):0}%`,'Pagos / totais','amber'],['Vagas oferecidas',number.format(totals.vacancies),'somente ofertas regulares','cyan'],['Demanda efetiva',totals.vacancies?`${(totals.regular/totals.vacancies).toFixed(1)}x`:'0x','somente inscritos regulares','orange']]
 const geographicSummary=selectedEtec?`Local de oferta: ${selectedEtecLabel}`:geographicScope?`${geographicScopeIsMunicipality?'Município':'Regional'}: ${geographicScope.label}`:''; const scopeSummary=[geographicSummary,filters.regional&&geographicSummary!==`Regional: ${filters.regional}`?`Regional: ${filters.regional}`:'',filters.etec&&!selectedEtec?`Local de oferta: ${etecs.find(etec=>etec.name===filters.etec)?.label??filters.etec}`:'',filters.modality?`Modalidade: ${filters.modality}`:'',filters.course?`Curso: ${filters.course}`:'',filters.period?`Período: ${filters.period}`:''].filter(Boolean).join(' • ')||scope.replace('Sao','São')
 void kpis
 const visible=activeEtecs.map(etec=>etec.name); const regionalRows=options.regional.map(regional=>{const items=data.filter(item=>item.regional===regional);const regularItems=items.filter(item=>!item.isTrainee);const value=items.reduce((sum,item)=>sum+item.paid+item.unpaid,0);const regularValue=regularItems.reduce((sum,item)=>sum+item.paid,0);const paid=items.reduce((sum,item)=>sum+item.paid,0);const vacancies=items.reduce((sum,item)=>sum+item.vacancies,0);const lowDemand=regularItems.filter(item=>(item.vacancies?item.paid/item.vacancies:0)<1).length;return {regional,value,regularValue,paid,vacancies,lowDemand,regularOfferCount:regularItems.length}}).filter(row=>row.value>0); const offerStatus=[['Demanda confortável',demandBands.comfortable,'demand-comfortable'],['Atenção',demandBands.attention,'demand-attention'],['Baixa demanda',demandBands.low,'demand-low']] as const
 return <div className="app-shell">
<header className="institutional-header">
<div className="brand">
<div>
<h1>{sourceMetadata.edicao.toUpperCase()}</h1>
<p>Acompanhamento das Inscricoes</p>
</div>
</div>
<div className="header-meta">
<span>Snapshot local da exportação<br/>
<b>{sourceMetadata.arquivo_origem}</b>
</span>
<button type="button" onClick={()=>{setImportMessage('');setImportOpen(true)}}>Importar planilha</button>
</div>
</header>
<main className="content">
<section className="filter-card">
<div className="filter-bar">
<SelectFilter label="Regional" value={filters.regional} values={options.regional} onChange={value=>updateFilter('regional',value)}/>
<SelectFilter label="Etec" value={filters.etec} values={options.etec} onChange={value=>updateFilter('etec',value)} etecOptions={etecs}/>
<SelectFilter label="Modalidade" value={filters.modality} values={options.modality} onChange={value=>updateFilter('modality',value)}/>
<SelectFilter label="Eixo tecnológico" value="" values={[]} onChange={()=>{}}/>
<SelectFilter label="Curso" value={filters.course} values={options.course} onChange={value=>updateFilter('course',value)}/>
<SelectFilter label="Periodo" value={filters.period} values={options.period} onChange={value=>updateFilter('period',value)}/>
<button className="clear-button" type="button" onClick={clearFilters}>Limpar filtros</button>
</div>
</section>
<section className="scope-row">
<div>
<span>VISUALIZANDO</span>
<strong>{scopeSummary}</strong>
</div>{(selectedEtec||geographicScope)&&<button className="selection-clear" type="button" onClick={clearFilters}>Limpar selecao</button>}</section>
<section className="dashboard-top">
<section className="kpi-row consolidated-kpis">
<article className="kpi-card enrollment-kpi">
<div className="enrollment-copy">
<p>Inscrições</p>
<strong>{number.format(total)}</strong>
<div className="enrollment-progress" role="progressbar" aria-label={`Inscrições: ${total?Math.round(totals.paid/total*100):0}% pagos e ${total?Math.round(totals.trainee/total*100):0}% treineiros`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={total?Math.round((totals.paid+totals.trainee)/total*100):0}>
<i className="enrollment-progress-paid" style={{width:`${total?totals.paid/total*100:0}%`}}/>
<i className="enrollment-progress-trainee" style={{width:`${total?totals.trainee/total*100:0}%`}}/>
</div>
<div className="enrollment-metrics">
<span className="enrollment-metric paid"><i aria-hidden="true"/>{number.format(totals.paid)} pagos ({total?`${Math.round(totals.paid/total*100)}%`:'0%'})</span>
<span className="enrollment-metric trainee"><i aria-hidden="true"/>{number.format(totals.trainee)} treineiros ({total?`${(totals.trainee/total*100).toFixed(1)}%`:'0%'})</span>
</div>
</div>
</article>
<article className="kpi-card demand-kpi">
<div className="demand-copy"><p>Vagas e demanda</p><div className="demand-values"><strong>{number.format(totals.vacancies)}</strong><small>vagas disponíveis</small></div><small>{number.format(totals.regular)} inscritos pagos sem treineiros</small></div>
<div className="demand-badge" aria-label={`${totals.vacancies?`${(totals.regular/totals.vacancies).toFixed(1)}x`:'0x'} candidatos por vaga`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><div><strong>{totals.vacancies?`${(totals.regular/totals.vacancies).toFixed(1)}x`:'0x'}</strong><span>candidato/vaga</span></div></div>
</article>
<article className="kpi-card offer-status-kpi">
<div className="kpi-status-heading">
<p>Situação das ofertas</p>
<small>{number.format(regularOfferCount)} turmas</small>
</div>
<div className="status-list">{offerStatus.map(([label,value,tone],index)=>{const percentage=regularOfferCount?value/regularOfferCount*100:0;const roundedPercentage=Math.round(percentage);return <button type="button" key={label} className={`${tone}${statusFilter===(['comfortable','attention','low'] as OfferStatus[])[index]?' active':''}`} onClick={()=>{const next=(['comfortable','attention','low'] as OfferStatus[])[index];setStatusFilter(current=>current===next?null:next)}}>
<div className="status-value"><strong data-label={label}>{number.format(value)}</strong></div>
<div className="status-progress" role="progressbar" aria-label={`${label}: ${roundedPercentage}% das ofertas`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedPercentage}><i style={{width:`${percentage}%`}}/><span className="status-progress-label" style={{left:`${percentage/2}%`}}>{roundedPercentage}%</span></div>
</button>})}</div>
</article>
</section>
<div className="primary-panels">
<article className="panel map-panel">
<div className="panel-header">
<h2>Distribuicao geografica das inscricoes pagas</h2>
<span>{visible.length} locais</span>
</div>
<D3GeographicMap etecs={etecs} selected={selectedEtec} visible={visible} resetKey={mapResetKey} onSelect={selectEtec} onGeographicSelect={selectGeographicScope} onGeographicClear={clearGeographicScope}/>
<p className="panel-note">Navegue pelas regionais e municípios, ou clique em um local para filtrar o painel.</p>
</article>
<article className="panel evolution-panel">
<div className="panel-header">
<h2>Acompanhamento das inscricoes</h2>
</div>
<div className="analysis-tabs" role="tablist" aria-label="Análises">
<button type="button" role="tab" aria-selected={analysisTab==='evolution'} className={analysisTab==='evolution'?'active':''} onClick={()=>setAnalysisTab('evolution')}>Evolução</button>
<button type="button" role="tab" aria-selected={analysisTab==='regional'} className={analysisTab==='regional'?'active':''} onClick={()=>setAnalysisTab('regional')}>Desempenho por Regional</button>
</div>
{analysisTab==='evolution'?<TrendChart data={data} target={totals.target}/>:<div className="regional-table analysis-regional-table">
<div className="regional-head">
<span>{performanceTable.column}</span>
<span>Inscritos</span>
<span>Pagos</span>
<span>Conversao</span>
<span>Demanda</span>
<span>Baixa demanda</span>
</div>{regionalRows.map(row=>
<div className="regional-line" key={row.regional}>
<strong>{performanceTable.label||row.regional}</strong>
<span>{number.format(row.value)}</span>
<span>{number.format(row.paid)}</span>
<span>{row.value?`${Math.round(row.paid/row.value*100)}%`:'0%'}</span>
<span>{row.vacancies?`${(row.regularValue/row.vacancies).toFixed(1)}x`:'0x'}</span>
<span>{number.format(row.lowDemand)} · {row.regularOfferCount?`${(row.lowDemand/row.regularOfferCount*100).toFixed(1).replace('.',',')}%`:'0,0%'}</span>
</div>)}<div className="regional-total">
<strong>Total geral</strong>
<span>{number.format(total)}</span>
<span>{number.format(totals.paid)}</span>
<span>{total?`${Math.round(totals.paid/total*100)}%`:'0%'}</span>
<span>{totals.vacancies?`${(totals.regular/totals.vacancies).toFixed(1)}x`:'0x'}</span>
<span>{number.format(demandBands.low)} · {regularOfferCount?`${(demandBands.low/regularOfferCount*100).toFixed(1).replace('.',',')}%`:'0,0%'}</span>
</div>
</div>}
</article>
</div>
</section>
</main>
{importOpen&&<div className="import-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="import-close" type="button" aria-label="Fechar" onClick={()=>setImportOpen(false)}>×</button><p className="import-eyebrow">Atualização de dados</p><h2 id="import-title">Importar planilha</h2><p className="import-copy">Informe a senha de importação e selecione a exportação do Vestibulinho. A versão anterior continuará disponível até esta planilha ser validada e publicada.</p><form onSubmit={uploadImport}><label className="import-email">Senha de importação<input type="password" value={importPassword} onChange={event=>setImportPassword(event.target.value)} autoComplete="current-password" required/></label><label className="import-file">Arquivo .xls ou .xlsx<input type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>setImportFile(event.target.files?.[0]??null)}/><span>{importFile?.name??'Selecionar exportação do Vestibulinho'}</span></label><button className="import-submit" type="submit" disabled={importing}>{importing?'Importando...':'Validar e publicar'}</button></form><p className="import-message" role="status">{importMessage}</p></section></div>}
<footer className="dashboard-footer">Correções e atualizações: rafael.ruiz@cps.sp.gov.br · CGTEC — ASCA
</footer>
</div>
}
