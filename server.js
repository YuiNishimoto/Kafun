import express from 'express';
import cors    from 'cors';
import fs      from 'fs';
import path    from 'path';
import * as turf    from '@turf/turf';
import fetch   from 'node-fetch';
import { parse } from 'csv-parse/sync';
import { fileURLToPath }  from 'url';

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

app.post('/api/locate', async (req, res) => {
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
		sneeze
	} = req.body;
	
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
	                   
	try {
		const resp    = await fetch(apiUrl);
		const csvText = await resp.text();

		// CSVをパース（同期版）
    	const records = parse(csvText, {
			columns: true,      // ヘッダ行をキーに
			skip_empty_lines: true
		});

    	// レスポンス組み立て
    	return res.json({
    		city,
    		ward,
    		citycode,
			start,
			end,
			pollen: records   // e.g. [{ date: '2025-06-27T00:00:00+09:00', pollen: '1', … }, …]
		});

	} catch (e) {
		console.error(e);
		return res.status(500).json({
			citycode,
			start,
			end,
			pollen: [],
			error: '花粉API取得エラー'
		});
	}
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});