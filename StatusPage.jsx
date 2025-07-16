import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function StatusPage() {
	const { state } = useLocation();
	const navigate  = useNavigate();
	const msg       = state?.statusMessage ?? 'ステータス情報がありません';
	const result    = state?.result;

	return (
		<div style={{ textAlign:'center', maxWidth:600, margin:'auto', padding:'1rem' }}>
      		<h1>Status</h1>
      		<p className={msg.startsWith('[エラー]') ? 'error' : 'status'}>
        		{msg}
      		</p>

      		{result && (
    			<>
          			<h2>判定結果</h2>
          			<p>地域: {result.city} {result.ward} (CityCode: {result.citycode})</p>
          			<p>期間: {result.start} ～ {result.end}</p>
          			<ul>
            			{result.pollen.map(r => (
              				<li key={r.date}>{r.date}: {r.pollen}</li>
            			))}
          			</ul>
        		</>
      		)}

      		<button onClick={() => navigate(-1)} style={{ marginTop:'1rem' }}>
        		フォームに戻る
      		</button>
    	</div>
  	);
}