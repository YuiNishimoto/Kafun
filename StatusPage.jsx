import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import vegaEmbed from 'vega-embed';

export default function StatusPage() {
	const { state } = useLocation();
	const navigate  = useNavigate();
	
	const city      = state?.city;
  	const ward      = state?.ward;
  	const analysis  = state?.analysis ?? '解析結果がありません';
	const spec     = state?.vegaSpec;
	const chartRef = useRef(null);

	useEffect(() => {
		if (spec && chartRef.current) {
			vegaEmbed(chartRef.current, spec, {
				actions: false,
				width: 1000,
				height: 300
			})
			.catch(err => console.error('Vega embed error:', err));
		}
	}, [spec]);

	return (
		<>
			<div style={{ textAlign:'center', maxWidth:600, margin:'auto', padding:'1rem' }}>
				<h1>判定結果</h1>

				{city && <p>地域: {city} {ward}</p>}

				<h2>AIによる解析結果</h2>
				<div style={{
					textAlign:    'left',
					whiteSpace:   'pre-wrap',
					border:       '1px solid #ddd',
					padding:      '1rem',
					borderRadius: '4px',
					margin:       '1rem auto',
					maxWidth:     '100%',
					background:   '#fafafa'
				}}>
					{analysis}
				</div>
			</div>

			{spec && (
				<div style={{ textAlign:'center',maxWidth:1000, margin:'auto' }}>
					<h2>花粉飛散量グラフ</h2>
					<p>データが欠測している時間は、AIによって予測値を算出した。</p>
						<div ref={chartRef} style={{ width: '100%' }}/>
				</div>
			)}

			<div style={{ textAlign:'center', maxWidth:600, margin:'auto', padding:'1rem' }}>
				<button onClick={() => navigate(-1)} style={{ marginTop:'1rem', padding:'0.5rem 1rem' }}>
					フォームに戻る
				</button>
			</div>
		</>
  	);
}