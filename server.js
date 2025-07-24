import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import fs      from 'fs';
import path    from 'path';
import * as turf    from '@turf/turf';
import fetch   from 'node-fetch';
import { parse } from 'csv-parse/sync';
import { fileURLToPath }  from 'url';
import OpenAI from "openai";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app   = express();
const PORT  = process.env.PORT || 34356;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public_html')));

// GeoJSON を読み込む
const geoJson  = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'N03-20250101.geojson'), 'utf8')
);
const features = geoJson.features;

// 日付を YYYYMMDD 文字列に整形
function fmtDate(date){
	const y = date.getFullYear();
	const m = date.getMonth()+1;
	const d = date.getDate();
	return `${y}${m.toString().padStart(2,'0')}${d.toString().padStart(2,'0')}`;
}

function parseJsonOnly(text) {
	// 前後の空白を除去
	let s = text.trim();
	// ```json と ``` を削除
	s = s.replace(/```(?:json)?/g, '').trim();
	// 最初の { or [ 以降を切り出し
	const start = s.search(/[{[]/);
	
  	if (start >= 0) s = s.slice(start);
  	// 最後の } or ] を探し、その直後までを残す
  	const lastCurly = s.lastIndexOf('}');
  	const lastSquare = s.lastIndexOf(']');
  	const end = Math.max(lastCurly, lastSquare);
  	if (end >= 0) s = s.slice(0, end + 1);
  	
  	return JSON.parse(s);
}

app.post('/api/locate', async (req, res) => {
	try {
		const {
			lat,
			lng,
			periodType,
			periodValue,
			diagnosed,
			fever,
			facePain,
			eyeItch,
			nasal,
			cough,
			sneeze,
			outdoor
		} = req.body;
		
		const periodLabels = { day: '日', week: '週', month: '月' };
    	const periodLabel  = periodLabels[periodType] || '';

		// 症状継続期間が有効なものかの確認
		const ranges = { day: [1, 6], week: [1, 4], month: [1, 12] };
		if (
			!ranges[periodType] ||
			typeof periodValue !== 'number' ||
			periodValue < ranges[periodType][0] ||
			periodValue > ranges[periodType][1]
		) {
			return res
				.status(400)
				.json({ error: '症状継続期間の入力が不正です', periodType, periodValue });
		}


		// 位置判定
		const pt = turf.point([lng, lat]);
		let city = null;
		let ward = null;
		let citycode = null;
		
		for (const feat of features) {
			if (turf.booleanPointInPolygon(pt, feat)) {
				city = feat.properties.N03_004; // 市
				ward = feat.properties.N03_005; // 区町村・郡
				citycode = feat.properties.N03_007; // 全国地方公共団体コード
				break;
			}
		}
		
		// 見つからなかった場合
		if (!citycode) {
			return res.json({
				city: null,
				ward: null,
				citycode: null,
				pollen: [],
				message:'行政区域コードが見つかりませんでした'
			});
		}
		
		// API用日付計算
		const today = new Date();
		const end = fmtDate(today);
		const start = fmtDate(new Date(today.getTime() - 7*24*60*60*1000));
		
		// 花粉API呼び出し
		const apiUrl = `https://wxtech.weathernews.com/opendata/v1/pollen`
						+ `?citycode=${citycode}&start=${start}&end=${end}`;
					
		const resp    = await fetch(apiUrl);
		const csvText = await resp.text();

		// CSVをパース（同期版）
		const records = parse(csvText, {
			columns: true,      // ヘッダ行をキーに
			skip_empty_lines: true
		});

		// 分析用（欠測値除外）
		const validForAnalysis = records
  			.filter(r => Number(r.pollen) !== -9999)
  			.map(r => ({
    			date: r.date,
    			pollen: Number(r.pollen)
  			}));
  			
  		// グラフ用（nullを残す）
  		let graphInputs = records.map(r => ({
  			date: r.date,
  			pollen: Number(r.pollen) === -9999 ? null : Number(r.pollen)
  		}));

		const analysisPrompt = `
過去1週間の花粉飛散量とユーザーの症状回答をもとに、花粉症とどの程度疑われるかを日本語で簡潔にまとめてください。
【症状期間】
症状は${periodValue}${periodLabel}続いています。

【花粉データ】
${JSON.stringify(validForAnalysis, null, 2)}

【症状回答】
${JSON.stringify(
  { diagnosed, fever, facePain, eyeItch, nasal, cough, sneeze, outdoor },
  null, 2
)}

・花粉データはdateが時間、pollenが花粉飛散量（花粉の個数/cm^2）です。1時間ごとのデータで、欠測値は除外されています。
・一番最後の回答は、屋内にいる時より外にいる時に症状を感じるかどうかの回答です。そう感じない場合は、どちらも同じと感じているか、屋内の方が症状がひどいと感じています。

以下の出力フォーマットを厳密に守ってください。  
1. まず「あなたの花粉症度は〇〇です。」（〇〇は0–100の数字）。  
2. 次に「あなたの症状で最も疑われる原因は、〇〇です。」  
3. 次に原因ランキング（5位まで）を、必ず確率付きで示してください。
4. 次にこの時期に疑われるアレルゲンを提示してください。
5. 最後に理由などの説明

――――――――――  
期待する出力例 （この例は参考です。この例にはない疾患が疑われる場合は、その疾患を答えて下さい。）
あなたの花粉症度は50です。  
あなたの症状で最も疑われる原因は、花粉症です。  

原因ランキング:  
1. 花粉症  50%
2. 副鼻腔炎  20%
3. 風邪  15%
4. 気管支炎  10%
5. その他の疾患  5%

この時期に疑われるアレルゲンは、スギやヒノキです。  

（解説）
――――――――――
`;
		const chat = await openai.chat.completions.create({
			model: 'gpt-4.1-mini-2025-04-14',
			messages: [
				{ role: 'system', content: 'あなたは花粉の専門家です。' },
				{ role: 'user',   content: analysisPrompt }
			],
			temperature: 0.7
		});
		const analysis = chat.choices[0].message.content.trim();
		
		if (graphInputs.some(({ pollen }) => pollen === null)) {
			// 欠測値の補完
			const imputePrompt = `
必ず**純粋な JSON**のみ返してください（説明文・コードフェンス不要）。
以下は1時間ごとの花粉飛散量（花粉の個数/cm^2）のデータです。欠測にはnullがあります。
欠測部分を予測し、補完して下さい。
${JSON.stringify(graphInputs, null, 2)}
`;
			const imputeRes = await openai.chat.completions.create({
    			model: 'gpt-4.1-nano-2025-04-14',
    			messages: [
					{ role: 'system', content: 'あなたは時系列データの欠測を補完する専門家です。' },
      				{ role: 'user',   content: imputePrompt }
    			],
    			temperature: 0
  			});
  			console.log('📝 impute 生レスポンス:\n', imputeRes.choices[0].message.content);
  			
  			let imputedRecords;
  			try {
  				imputedRecords = parseJsonOnly(imputeRes.choices[0].message.content);
  			} catch (err) {
  				console.error('欠測値の補完に失敗:', err);
  				imputedRecords = graphInputs;
  			}
  			graphInputs = imputedRecords;
  			graphInputs.sort( (a, b) => new Date(a.date) - new Date(b.date) );
  		}
		
		const chartPrompt = `
必ず**純粋な JSON**のみ返してください（説明文・コードフェンス不要）。
以下のデータをVega-Lite spec形式のJSONにして下さい。
期待するエンコーディング例：
"encoding": {
  "x": { "field": "date", "type": "temporal" },
  "y": { "field": "pollen", "type": "quantitative" }
}
${JSON.stringify(graphInputs, null, 2)}
`;
		const chartRes = await openai.chat.completions.create({
  			model: 'gpt-4.1-nano-2025-04-14',
  			messages: [
    			{ role: 'system', content: 'あなたはデータ可視化の専門家です。' },
    			{ role: 'user',   content: chartPrompt }
  			],
  			temperature: 0
		});
		console.log('📝 chart 生レスポンス:\n', chartRes.choices[0].message.content);
		
		const defaultSpec = {
			$schema: "https://vega.github.io/schema/vega-lite/v5.json",
			"data": { "values": graphInputs },
			"mark": "line",
			"encoding": {
    			"x": {"field":"date","type":"temporal"},
    			"y": {"field":"pollen","type":"quantitative"}
  			}
		};
		let vegaSpec;
  			try {
  				vegaSpec = parseJsonOnly(chartRes.choices[0].message.content);
  			} catch (err) {
  				console.error('Vega-Lite spec パース失敗:', err);
  				vegaSpec= defaultSpec;
  			}
		
		return res.json({city, ward, analysis, records: graphInputs, vegaSpec });
		
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: 'サーバー内部エラー',
			detail: err.message
		});
	}
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});