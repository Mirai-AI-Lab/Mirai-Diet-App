/**
 * ダイエット健康管理アプリ GAS（Phase 1）
 * 仕様書: 仕様書/ダイエット健康管理アプリ_仕様書.md
 *
 * セットアップ:
 * 1. 下の SHEET_ID / DRIVE_FOLDER_ID を自分の値に差し替え
 * 2. スクリプトプロパティに GEMINI_API_KEY を設定（AI分析用・Phase 1後半でも可）
 * 3. ウェブアプリとしてデプロイ
 */

const SHEET_ID = "1qBeXxm7RB92YuimEN4gfWeRo3IDalTI7ZfqwNC090bg";
const DRIVE_FOLDER_ID = "1WySdeyLYUyyg27S335cOw22qFyeBV3Le";
const GAS_VERSION = "20260529-1";

function getGeminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
}

var GEMINI_MODEL = "gemini-2.5-flash";
var GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";

function isUrlFetchQuotaError_(err) {
  var msg = String(err && err.message ? err.message : err);
  return msg.indexOf("too many times") !== -1 || msg.indexOf("urlfetch") !== -1;
}

function callGeminiText_(prompt, modelName) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY が未設定です" };
  }

  var model = modelName || GEMINI_MODEL;
  var url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + model + ":generateContent?key=" + apiKey;

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
  } catch (err) {
    if (isUrlFetchQuotaError_(err)) {
      markUrlFetchQuotaHit_();
      return { ok: false, error: "urlfetch_quota", quotaExceeded: true };
    }
    return { ok: false, error: String(err.message || err) };
  }

  var status = response.getResponseCode();
  var body = response.getContentText();

  if (status !== 200) {
    var detail = body;
    try {
      var errJson = JSON.parse(body);
      if (errJson.error && errJson.error.message) detail = errJson.error.message;
    } catch (ignore) {}
    console.error("Gemini API HTTP " + status + " (" + model + "): " + body);
    return { ok: false, error: "HTTP " + status + ": " + detail, model: model };
  }

  var json = JSON.parse(body);
  var text = json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text;

  if (!text) {
    console.error("Gemini API 空レスポンス (" + model + "): " + body);
    return { ok: false, error: "empty_response", model: model };
  }

  return { ok: true, text: text, model: model };
}

function callGeminiWithFallback_(prompt) {
  var result = callGeminiText_(prompt, GEMINI_MODEL);
  if (result.ok || result.quotaExceeded) return result;
  if (result.error && result.error.indexOf("HTTP 404") !== -1
      && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    return callGeminiText_(prompt, GEMINI_FALLBACK_MODEL);
  }
  return result;
}

function parseImageBlob_(blob) {
  var match = String(blob).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function callGeminiVision_(prompt, imageBlob, modelName) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY が未設定です" };
  }

  var img = parseImageBlob_(imageBlob);
  if (!img) {
    return { ok: false, error: "invalid_image" };
  }

  var model = modelName || GEMINI_MODEL;
  var url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + model + ":generateContent?key=" + apiKey;

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: img.mimeType, data: img.data } }
          ]
        }]
      })
    });
  } catch (err) {
    if (isUrlFetchQuotaError_(err)) {
      markUrlFetchQuotaHit_();
      return { ok: false, error: "urlfetch_quota", quotaExceeded: true };
    }
    return { ok: false, error: String(err.message || err) };
  }

  var status = response.getResponseCode();
  var body = response.getContentText();

  if (status !== 200) {
    var detail = body;
    try {
      var errJson = JSON.parse(body);
      if (errJson.error && errJson.error.message) detail = errJson.error.message;
    } catch (ignore) {}
    console.error("Gemini Vision HTTP " + status + " (" + model + "): " + body);
    return { ok: false, error: "HTTP " + status + ": " + detail, model: model };
  }

  var json = JSON.parse(body);
  var text = json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text;

  if (!text) {
    console.error("Gemini Vision 空レスポンス (" + model + "): " + body);
    return { ok: false, error: "empty_response", model: model };
  }

  return { ok: true, text: text, model: model };
}

function buildMealAnalysisPrompt_(mealType, memo) {
  return "あなたは50代女性のダイエット・健康管理の伴走者です。先生口調・評価口調は禁止。\n"
    + "肯定ファーストで、温かい口語の日本語（です・ます）で答えてください。\n\n"
    + "この画像は食事の写真、または食事記録アプリのスクリーンショットです。\n"
    + "食事タイプ: " + (mealType || "食事") + "\n"
    + (memo ? "ユーザーメモ: " + memo + "\n" : "")
    + "\n以下の構成で400字以内:\n"
    + "1. 肯定（記録してくれたこと）\n"
    + "2. この食事の内容（写真から読める範囲で具体的に）\n"
    + "3. ひとことアドバイス（バランス・量）\n"
    + "4. 【食べる順番】この食事に合わせて「1. 〇〇 → 2. 〇〇 → … → 最後にごはん」の形式で。\n"
    + "   例: 野菜 → 小鉢のタンパク質 → 味噌汁の具 → 最後にごはん\n"
    + "読めないものは推測で埋めない。極端な制限・医療診断は禁止。";
}

function buildOfflineMealAdvice_(mealType) {
  var type = mealType || "食事";
  return "写真を送ってくれてありがとうございます。"
    + type + "の記録、続いていますね。\n\n"
    + "【食べる順番の目安】\n"
    + "1. 野菜・サラダ\n"
    + "2. 味噌汁の具・スープ\n"
    + "3. タンパク質（魚・肉・豆腐・卵など）\n"
    + "4. 最後にごはん（小盛りから）";
}

function analyzeMealPhoto(data) {
  data = data || {};
  var mealType = data.mealType || "食事";
  var memo = data.memo || "";
  var imageBlob = data.imageBlob;

  if (!imageBlob) {
    return {
      status: "error",
      advice: "食事の写真を添付してください。",
      gasVersion: GAS_VERSION
    };
  }

  if (isSummaryAiBlocked_()) {
    return {
      status: "success",
      advice: buildOfflineMealAdvice_(mealType),
      gasVersion: GAS_VERSION,
      mode: "offline"
    };
  }

  var prompt = buildMealAnalysisPrompt_(mealType, memo);
  var result = callGeminiVision_(prompt, imageBlob);

  if (result.ok) {
    return { status: "success", advice: result.text, gasVersion: GAS_VERSION };
  }
  if (result.quotaExceeded) {
    markUrlFetchQuotaHit_();
  }

  console.error("食事分析エラー → オフライン:", result.error);
  return {
    status: "success",
    advice: buildOfflineMealAdvice_(mealType),
    gasVersion: GAS_VERSION,
    mode: "offline"
  };
}

// =========================================
// インボディ（ヘルスメーター）写真 → 数値の読み取り
// 体重タブで計測画面のスクショを送ると、各項目を自動で埋めるための値を返す
// =========================================

function buildInBodyParsePrompt_() {
  return "この画像は家庭用の体組成計・ヘルスメーター（インボディ等）の計測結果画面、"
    + "またはそのスマホアプリのスクリーンショットです。表示されている数値を読み取ってください。\n\n"
    + "次のキーを持つJSONだけを返してください（説明文・マークダウンは禁止。JSONのみ）:\n"
    + '{"weight_kg":null,"body_fat_pct":null,"muscle_mass_kg":null,"visceral_fat_level":null,"bmr_kcal":null,"bmi":null,"target_weight_kg":null,"target_body_fat_pct":null}\n\n'
    + "各キーの意味:\n"
    + "・weight_kg = 体重(kg)\n"
    + "・body_fat_pct = 体脂肪率(%)\n"
    + "・muscle_mass_kg = 筋肉量(kg)\n"
    + "・visceral_fat_level = 内臓脂肪レベル\n"
    + "・bmr_kcal = 基礎代謝(kcal)\n"
    + "・bmi = BMI\n"
    + "・target_weight_kg / target_body_fat_pct = 画面に目標値が表示されていれば。無ければ null\n\n"
    + "ルール:\n"
    + "・読み取れない項目は null。推測で埋めない。\n"
    + "・数値のみ（単位や記号は付けない）。全角数字は半角にする。";
}

function extractJsonObject_(text) {
  if (!text) return null;
  var cleaned = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
  var start = cleaned.indexOf("{");
  var end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function toNumberOrNull_(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

function parseInBodyPhoto(data) {
  data = data || {};
  var imageBlob = data.imageBlob;

  if (!imageBlob) {
    return {
      status: "error",
      message: "ヘルスメーターの写真を添付してください。",
      gasVersion: GAS_VERSION
    };
  }

  if (isChatAiBlocked_()) {
    return {
      status: "error",
      message: "いまAIが使えません（" + getChatOfflineReason_() + "）。数値は手入力でお願いします。",
      offline: true,
      gasVersion: GAS_VERSION
    };
  }

  var result = callGeminiVision_(buildInBodyParsePrompt_(), imageBlob);
  if (!result.ok) {
    if (result.quotaExceeded) markUrlFetchQuotaHit_();
    console.error("parseInBodyPhoto エラー:", result.error);
    return {
      status: "error",
      message: "写真から数値を読み取れませんでした。お手数ですが手入力でお願いします。",
      error: result.error,
      gasVersion: GAS_VERSION
    };
  }

  var parsed = extractJsonObject_(result.text);
  if (!parsed) {
    return {
      status: "error",
      message: "写真から数値を読み取れませんでした。お手数ですが手入力でお願いします。",
      raw: result.text,
      gasVersion: GAS_VERSION
    };
  }

  return {
    status: "success",
    values: {
      weight: toNumberOrNull_(parsed.weight_kg),
      bodyFat: toNumberOrNull_(parsed.body_fat_pct),
      muscleMass: toNumberOrNull_(parsed.muscle_mass_kg),
      visceralFat: toNumberOrNull_(parsed.visceral_fat_level),
      bmr: toNumberOrNull_(parsed.bmr_kcal),
      bmi: toNumberOrNull_(parsed.bmi),
      targetWeight: toNumberOrNull_(parsed.target_weight_kg),
      targetBodyFat: toNumberOrNull_(parsed.target_body_fat_pct)
    },
    gasVersion: GAS_VERSION
  };
}

function ensureSheetWithHeaders_(name, headers) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function getChatSession_(lineId) {
  if (!lineId) return null;
  var sheet = ensureSheetWithHeaders_("チャット状態", [
    "lineId", "mealType", "memo", "mealAnalysis", "updatedAt"
  ]);
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][0] !== lineId) continue;
    var updated = values[i][4] ? new Date(values[i][4]) : null;
    if (updated && (new Date().getTime() - updated.getTime()) > 24 * 60 * 60 * 1000) {
      return null;
    }
    return {
      mealType: values[i][1] || "食事",
      memo: values[i][2] || "",
      mealAnalysis: values[i][3] || "",
      updatedAt: values[i][4]
    };
  }
  return null;
}

function saveChatSession_(lineId, data) {
  if (!lineId || !data) return;
  data = data || {};
  var sheet = ensureSheetWithHeaders_("チャット状態", [
    "lineId", "mealType", "memo", "mealAnalysis", "updatedAt"
  ]);
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === lineId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  sheet.appendRow([
    lineId,
    data.mealType || "食事",
    data.memo || "",
    data.mealAnalysis || "",
    new Date().toISOString()
  ]);
}

function clearChatSession_(lineId) {
  if (!lineId) return;
  var sheet = SpreadsheetApp.getSheetByName("チャット状態");
  if (!sheet) return;
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === lineId) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function getUserMemories_(lineId) {
  if (!lineId) return [];
  var sheet = ensureSheetWithHeaders_("覚え", ["lineId", "content", "source", "updatedAt"]);
  var values = sheet.getDataRange().getValues();
  var out = [];
  var seen = {};
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] !== lineId) continue;
    var content = String(values[i][1] || "").trim();
    if (!content || seen[content]) continue;
    seen[content] = true;
    out.push(content);
  }
  return out.slice(-20);
}

function saveUserMemory_(lineId, content, source) {
  if (!lineId) return;
  content = String(content || "").trim();
  if (!content) return;
  var sheet = ensureSheetWithHeaders_("覚え", ["lineId", "content", "source", "updatedAt"]);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === lineId && values[i][1] === content) {
      sheet.getRange(i + 1, 4).setValue(new Date().toISOString());
      return;
    }
  }
  sheet.appendRow([lineId, content, source || "ai", new Date().toISOString()]);
}

function parseMemoryDirective_(message) {
  var m = String(message || "").trim();
  var prefixes = ["覚えて：", "覚えて:", "覚えておいて：", "覚えておいて:"];
  for (var i = 0; i < prefixes.length; i++) {
    if (m.indexOf(prefixes[i]) === 0) {
      return m.slice(prefixes[i].length).trim();
    }
  }
  return null;
}

function extractMemoryTags_(text) {
  var memories = [];
  var cleaned = String(text || "").replace(/\[\[MEMORY:\s*([^\]]+)\]\]/g, function (_, captured) {
    if (captured && captured.trim()) memories.push(captured.trim());
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, memories: memories };
}

function buildCoachSystemInstruction_(lineId) {
  var instruction = "あなたは50代女性の健康管理の伴走者です。先生口調・評価口調は禁止。\n"
    + "【必ず守る順番】\n"
    + "1. 肯定 … 続けている事実・小さな変化を具体的に認める\n"
    + "2. 現状 … 数字や記録を事実ベースで短く\n"
    + "3. 対策 … 1〜2個だけ（詰め込まない）\n"
    + "4. 伴走 … 「一緒に」「次の一歩は」で締める\n\n"
    + "食事の写真は既に認識済みのことが多い。システムに載っている食事内容を前提に、"
    + "追加質問（順番・量・ごはん半分なら等）には前の文脈を踏まえて答える。\n"
    + "【食べる順番】はこの食事に合わせて具体的に（例: 野菜 → タンパク質 → 最後にごはん）。\n"
    + "会話は短い往復を想定。400字以内。口語に近い温かい日本語。極端な制限・医療診断は禁止。\n\n"
    + "【記憶】ユーザーについて lasting な癖・弱点・好みが会話から分かったら、"
    + "返答末尾に [[MEMORY: 一文]] を1つまで付けてよい（ユーザーには見せない内部タグ）。"
    + "「覚えて」と言われた内容は必ず記憶する。";

  if (!lineId) return instruction;

  var memories = getUserMemories_(lineId);
  if (memories.length) {
    instruction += "\n\n【このユーザーについて覚えていること（会話で活かす）】\n"
      + memories.map(function (m, idx) { return (idx + 1) + ". " + m; }).join("\n");
  }

  var records = getRecentRecordsForUser_(lineId, 15);
  if (records.length) {
    instruction += "\n\n【直近の健康記録】\n" + buildAdviceContext_(records);
  }

  var session = getChatSession_(lineId);
  if (session && session.mealAnalysis) {
    instruction += "\n\n【いま相談中の食事（写真は認識済み）】\n"
      + "食事タイプ: " + session.mealType + "\n"
      + (session.memo ? "メモ: " + session.memo + "\n" : "")
      + session.mealAnalysis;
  }

  return instruction;
}

function buildGeminiContentsFromChat_(history) {
  var contents = [];
  history.forEach(function (msg) {
    var role = msg.role === "assistant" ? "model" : "user";
    var parts = [];
    if (msg.text) parts.push({ text: msg.text });
    if (msg.imageBlob && role === "user") {
      var img = parseImageBlob_(msg.imageBlob);
      if (img) parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
    }
    if (parts.length) contents.push({ role: role, parts: parts });
  });
  return contents;
}

function callGeminiChat_(contents, modelName, systemInstruction) {
  var apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY が未設定です" };
  }

  var model = modelName || GEMINI_MODEL;
  var url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + model + ":generateContent?key=" + apiKey;

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction || buildCoachSystemInstruction_() }]
        },
        contents: contents
      })
    });
  } catch (err) {
    if (isUrlFetchQuotaError_(err)) {
      markUrlFetchQuotaHit_();
      return { ok: false, error: "urlfetch_quota", quotaExceeded: true };
    }
    return { ok: false, error: String(err.message || err) };
  }

  var status = response.getResponseCode();
  var body = response.getContentText();

  if (status !== 200) {
    var detail = body;
    try {
      var errJson = JSON.parse(body);
      if (errJson.error && errJson.error.message) detail = errJson.error.message;
    } catch (ignore) {}
    console.error("Gemini Chat HTTP " + status + ": " + body);
    return { ok: false, error: "HTTP " + status + ": " + detail };
  }

  var json = JSON.parse(body);
  var text = json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text;

  if (!text) {
    return { ok: false, error: "empty_response" };
  }
  return { ok: true, text: text };
}

function buildOfflineChatReply_(message, lineId, history, hasMealContext) {
  var msg = String(message || "");
  history = history || [];
  var session = lineId ? getChatSession_(lineId) : null;
  var hasSession = hasMealContext || !!(session && session.mealAnalysis);

  if (/お腹.*(いっぱい|満腹|パンパン|食べきれ|残せ)|満腹|食べきれない|途中で.*(お腹|満腹)/.test(msg)) {
    return "途中で満腹、よくあるんですよね。無理に残さなくて大丈夫です。\n\n"
      + "【いまからできること】\n"
      + "・残りは保存して、次の食事で調整\n"
      + "・次は「野菜 → タンパク質 → ごはんは小盛り」の順で、途中で止まりやすくなります\n\n"
      + "今日はどこまで食べました？ 残りが気になるなら、一緒に考えましょう。";
  }

  if (/半分|少な|減ら|小盛り|残り/.test(msg)) {
    if (hasSession && session && session.mealAnalysis) {
      return "ごはん半分、いい判断ですよね。\n\n"
        + "先に野菜とタンパク質、最後にごはん半分だと満足感を保ちやすいです。\n\n"
        + "【いまの食事メモ】\n" + session.mealAnalysis;
    }
    return "ごはん半分、いい判断ですよね。\n"
      + "満足感を保ちながら量を抑えるなら、先に野菜とタンパク質、最後にごはん半分がおすすめです。"
      + "食事の写真を送ってもらえれば、この食事に合わせて順番も具体的に出します。";
  }

  if (/順番|食事|ごはん|夕食|昼食|朝食|間食/.test(msg) || hasSession) {
    if (session && session.mealAnalysis) {
      return "送ってくれた" + (session.mealType || "食事") + "、覚えています。\n\n"
        + session.mealAnalysis + "\n\n"
        + "「ごはん半分なら？」など、続けて聞いてもらえれば一緒に考えます。";
    }
    return "写真を送ってくれてありがとうございます。"
      + "一般的な食べる順番はこうです。\n\n"
      + "1. 野菜・サラダ\n"
      + "2. 味噌汁の具・スープ\n"
      + "3. タンパク質（魚・肉・豆腐など）\n"
      + "4. 最後にごはん（小盛りから）\n\n"
      + "食事の写真を送ってもらえれば、この食事に合わせて具体的に出します。";
  }

  if (/体重|体脂肪|kg|キロ/.test(msg)) {
    var records = lineId ? getRecentRecordsForUser_(lineId, 8) : [];
    var weights = records.filter(function (r) { return r.recordType === "体重"; });
    if (weights.length) {
      var latest = weights[0];
      var w = latest.extraData && latest.extraData.weight;
      var bf = latest.extraData && latest.extraData.bodyFat;
      var line = "体重の記録、" + latest.date + "が" + w + "kg";
      if (bf != null) line += "（体脂肪率" + bf + "%）";
      return line + "ですね。続けられているのがいちばん大事です。\n"
        + "数字は上下します。焦らず、次の一歩は「今日の食事を写真1枚」だけ試してみませんか。";
    }
  }

  if (/覚え|弱点|癖|苦手/.test(msg)) {
    var memories = lineId ? getUserMemories_(lineId) : [];
    if (memories.length) {
      return "覚えていること: " + memories.slice(-3).join(" / ")
        + "\n\n「覚えて：〜」と送ってもらえれば、会話の中で活かしていきます。";
    }
    return "「覚えて：夕方に小腹が空く」のように送ってもらえれば、次からその前提で一緒に考えます。";
  }

  if (history.length) {
    return "聞いてくれてありがとうございます。続けられていることがいちばん大事です。\n"
      + "食事のことなら写真を1枚送ってください。順番や量、途中で満腹になったことも、一緒に考えます。";
  }

  return "こんにちは。食事の写真は1回送れば、裏で認識します。\n"
    + "「順番教えて」「途中でお腹いっぱいになった」など、なんでも聞いてください。";
}

function ingestMealPhoto(data) {
  data = data || {};
  var lineId = data.lineId;
  var mealType = data.mealType || "食事";
  var memo = data.memo || "";
  var imageBlob = data.imageBlob;

  if (!imageBlob) {
    return {
      status: "error",
      message: "食事の写真を添付してください。",
      gasVersion: GAS_VERSION
    };
  }

  var analysis;
  var mode = "online";

  if (isChatAiBlocked_()) {
    analysis = buildOfflineMealAdvice_(mealType);
    mode = "offline";
  } else {
    var prompt = buildMealAnalysisPrompt_(mealType, memo);
    var result = callGeminiVision_(prompt, imageBlob);
    if (result.ok) {
      analysis = result.text;
    } else {
      if (result.quotaExceeded) markUrlFetchQuotaHit_();
      analysis = buildOfflineMealAdvice_(mealType);
      mode = "offline";
    }
  }

  if (lineId) {
    saveChatSession_(lineId, {
      mealType: mealType,
      memo: memo,
      mealAnalysis: analysis
    });
  }

  return {
    status: "success",
    analysis: analysis,
    sessionActive: true,
    gasVersion: GAS_VERSION,
    mode: mode
  };
}

function getChatContext(data) {
  data = data || {};
  var lineId = data.lineId;
  var session = getChatSession_(lineId);
  return {
    status: "success",
    session: session,
    sessionActive: !!(session && session.mealAnalysis),
    memories: getUserMemories_(lineId),
    gasVersion: GAS_VERSION
  };
}

function getUserMemories(data) {
  data = data || {};
  return {
    status: "success",
    memories: getUserMemories_(data.lineId),
    gasVersion: GAS_VERSION
  };
}

function chatReply(data) {
  data = data || {};
  var lineId = data.lineId;
  var history = data.history || [];
  var message = String(data.message || "").trim();
  var imageBlob = data.imageBlob || null;
  var mealType = data.mealType || "食事";
  var memo = data.memo || "";
  var useSession = data.useSession === true;

  if (!message && !imageBlob && !useSession) {
    return {
      status: "error",
      reply: "メッセージか写真を送ってください。",
      gasVersion: GAS_VERSION
    };
  }

  var memoryDirective = parseMemoryDirective_(message);
  if (memoryDirective && lineId) {
    saveUserMemory_(lineId, memoryDirective, "user");
  }

  if (imageBlob && lineId) {
    ingestMealPhoto({
      lineId: lineId,
      mealType: mealType,
      memo: memo,
      imageBlob: imageBlob
    });
    useSession = true;
    imageBlob = null;
  }

  var session = lineId ? getChatSession_(lineId) : null;
  var hasMealContext = !!(session && session.mealAnalysis);

  if (isChatAiBlocked_()) {
    var offlineReply = buildOfflineChatReply_(message, lineId, history, hasMealContext);
    if (memoryDirective) {
      offlineReply = "覚えました。「" + memoryDirective + "」\n\n" + offlineReply;
    }
    return {
      status: "success",
      reply: offlineReply,
      sessionActive: hasMealContext,
      gasVersion: GAS_VERSION,
      mode: "offline",
      offlineReason: getChatOfflineReason_()
    };
  }

  var systemInstruction = buildCoachSystemInstruction_(lineId);
  var contents = buildGeminiContentsFromChat_(history);

  var userText = message;
  if (!userText) {
    if (hasMealContext) {
      userText = "（送った食事の写真について）アドバイスをください。";
    } else {
      userText = "（メッセージを送りました）";
    }
  }

  contents.push({
    role: "user",
    parts: [{ text: userText }]
  });

  if (contents.length > 16) {
    contents = contents.slice(contents.length - 16);
  }

  var result = callGeminiChat_(contents, null, systemInstruction);
  if (result.ok) {
    var parsed = extractMemoryTags_(result.text);
    parsed.memories.forEach(function (m) {
      saveUserMemory_(lineId, m, "ai");
    });
    var reply = parsed.text;
    if (memoryDirective) {
      reply = "覚えました。\n\n" + reply;
    }
    return {
      status: "success",
      reply: reply,
      sessionActive: hasMealContext,
      gasVersion: GAS_VERSION
    };
  }
  if (result.quotaExceeded) {
    markUrlFetchQuotaHit_();
  }

  console.error("chatReply エラー → オフライン:", result.error);
  var fallback = buildOfflineChatReply_(message, lineId, history, hasMealContext);
  if (memoryDirective) {
    fallback = "覚えました。\n\n" + fallback;
  }
  return {
    status: "success",
    reply: fallback,
    sessionActive: hasMealContext,
    gasVersion: GAS_VERSION,
    mode: "offline",
    offlineReason: result.error || "gemini_error"
  };
}

/** Apps Script で会話テスト: testChatReply を実行 */
function testChatReply() {
  var res = chatReply({
    lineId: "",
    history: [],
    message: "今日の夕食、順番教えて"
  });
  Logger.log(res.status + " / " + res.gasVersion);
  Logger.log(res.reply);
  return res;
}

/** Apps Script で接続テスト: testGeminiConnection を実行（1日1回程度） */
function testGeminiConnection() {
  var result = callGeminiText_("こんにちは。1文だけ返してください。");
  if (result.ok) {
    Logger.log("OK (" + result.model + "): " + result.text);
    return result;
  }
  if (result.quotaExceeded) {
    Logger.log("NG: GASの外部通信（urlfetch）が今日の上限に達しています。明日再試行してください。");
    return result;
  }
  Logger.log("NG: " + result.error);
  return result;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ status: "error", advice: "リクエストが空です", gasVersion: GAS_VERSION });
    }

    const body = JSON.parse(e.postData.contents);
    const { action, data } = body;

    let result;
    switch (action) {
      case "register":
        result = registerUser(data);
        break;
      case "getUsers":
        result = getUsers();
        break;
      case "uploadRecord":
        result = uploadRecord(data);
        break;
      case "getRecords":
        result = getRecords();
        break;
      case "getAIAdvice":
        result = getAIAdvice(data || {});
        break;
      case "analyzeMealPhoto":
        result = analyzeMealPhoto(data || {});
        break;
      case "parseInBodyPhoto":
        result = parseInBodyPhoto(data || {});
        break;
      case "ingestMealPhoto":
        result = ingestMealPhoto(data || {});
        break;
      case "getChatContext":
        result = getChatContext(data || {});
        break;
      case "getUserMemories":
        result = getUserMemories(data || {});
        break;
      case "getAIStatus":
        result = getAIStatus(data || {});
        break;
      case "chatReply":
        result = chatReply(data || {});
        break;
      default:
        result = { status: "error", message: "Unknown action" };
    }

    if (result && !result.gasVersion) result.gasVersion = GAS_VERSION;
    return jsonOutput_(result);
  } catch (err) {
    console.error("doPost エラー:", err);
    return jsonOutput_({
      status: "error",
      advice: "サーバーエラー: " + err.message,
      gasVersion: GAS_VERSION
    });
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function registerUser(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("ユーザー");
  if (!sheet) {
    sheet = ss.insertSheet("ユーザー");
    sheet.appendRow(["lineId", "name", "createdAt"]);
  }
  const values = sheet.getDataRange().getValues();
  const exists = values.some(function (row) { return row[0] === data.userId; });
  if (!exists) {
    sheet.appendRow([data.userId, data.displayName, new Date().toISOString()]);
  }
  return { status: "success" };
}

function getUsers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("ユーザー");
  if (!sheet) return { result: [] };
  const values = sheet.getDataRange().getValues().slice(1);
  return {
    result: values.map(function (r) {
      return { lineId: r[0], name: r[1] };
    })
  };
}

function uploadRecord(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("記録");
  if (!sheet) {
    sheet = ss.insertSheet("記録");
    sheet.appendRow([
      "date", "lineId", "userName", "recordType", "subType",
      "weight", "bodyFat", "muscleMass", "visceralFat",
      "duration", "distance", "memo", "imageUrls", "createdAt"
    ]);
  }

  var imageUrls = [];
  if (data.imageBlobs && data.imageBlobs.length > 0) {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    data.imageBlobs.forEach(function (blob, i) {
      try {
        var base64Data = blob.replace(/^data:image\/(png|jpeg|jpg|gif|webp);base64,/, "");
        var byteArray = Utilities.base64Decode(base64Data);
        var file = folder.createFile(
          Utilities.newBlob(byteArray, "image/jpeg", "diet_" + Date.now() + "_" + i + ".jpg")
        );
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageUrls.push("https://drive.google.com/uc?export=view&id=" + file.getId());
      } catch (err) {
        console.error("画像アップロードエラー:", err);
      }
    });
  }

  var ex = data.extraData || {};
  sheet.appendRow([
    data.date,
    data.lineId,
    data.userName,
    data.recordType,
    data.subType || "",
    ex.weight !== null && ex.weight !== undefined ? ex.weight : "",
    ex.bodyFat !== null && ex.bodyFat !== undefined ? ex.bodyFat : "",
    ex.muscleMass !== null && ex.muscleMass !== undefined ? ex.muscleMass : "",
    ex.visceralFat !== null && ex.visceralFat !== undefined ? ex.visceralFat : "",
    ex.duration !== null && ex.duration !== undefined ? ex.duration : "",
    ex.distance !== null && ex.distance !== undefined ? ex.distance : "",
    data.memo || "",
    imageUrls.join(","),
    new Date().toISOString()
  ]);

  return { status: "success" };
}

function getRecords() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("記録");
  if (!sheet) return { result: [] };

  const values = sheet.getDataRange().getValues().slice(1);
  const result = values.map(function (r) {
    return {
      date: r[0] instanceof Date ? Utilities.formatDate(r[0], "Asia/Tokyo", "yyyy-MM-dd") : r[0],
      lineId: r[1],
      userName: r[2],
      recordType: r[3],
      subType: r[4],
      extraData: {
        weight: r[5] !== "" ? Number(r[5]) : null,
        bodyFat: r[6] !== "" ? Number(r[6]) : null,
        muscleMass: r[7] !== "" ? Number(r[7]) : null,
        visceralFat: r[8] !== "" ? Number(r[8]) : null,
        duration: r[9] !== "" ? Number(r[9]) : null,
        distance: r[10] !== "" ? Number(r[10]) : null
      },
      memo: r[11],
      imageUrls: r[12] ? r[12].split(",").filter(function (u) { return u; }) : []
    };
  });

  return { result: result };
}

function getRecentRecordsForUser_(lineId, limit) {
  var all = getRecords().result || [];
  var filtered = lineId
    ? all.filter(function (r) { return r.lineId === lineId; })
    : all;
  filtered.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return filtered.slice(0, limit || 30);
}

function buildAdviceContext_(records) {
  var context = "以下は直近の健康記録データです:\n\n";
  records.forEach(function (r) {
    if (r.recordType === "体重") {
      var w = r.extraData && r.extraData.weight ? "体重 " + r.extraData.weight + "kg" : "";
      var bf = r.extraData && r.extraData.bodyFat ? "体脂肪率 " + r.extraData.bodyFat + "%" : "";
      var mm = r.extraData && r.extraData.muscleMass ? "筋肉量 " + r.extraData.muscleMass + "kg" : "";
      context += "[" + r.date + "] 体重測定: " + [w, bf, mm].filter(Boolean).join(", ") + "\n";
    } else if (r.recordType === "運動") {
      var dur = r.extraData && r.extraData.duration ? r.extraData.duration + "分" : "";
      var dist = r.extraData && r.extraData.distance ? r.extraData.distance + "km" : "";
      context += "[" + r.date + "] 運動: " + r.subType + " " + [dur, dist].filter(Boolean).join(" ") + "\n";
    } else if (r.recordType === "食事") {
      context += "[" + r.date + "] 食事(" + r.subType + "): " + (r.memo || "写真のみ") + "\n";
    } else if (r.recordType === "お通じ") {
      context += "[" + r.date + "] お通じ: " + r.subType + "\n";
    }
  });
  return context;
}

/** Geminiが使えない日（通信上限など）のお披露目用フォールバック */
function buildOfflineAdvice_(records) {
  var weights = records.filter(function (r) { return r.recordType === "体重"; });
  weights.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  var latest = weights.length ? weights[weights.length - 1] : null;
  var first = weights.length ? weights[0] : null;
  var exerciseCount = records.filter(function (r) { return r.recordType === "運動"; }).length;
  var bowelData = records.filter(function (r) { return r.recordType === "お通じ"; });
  var bowelOk = bowelData.filter(function (r) { return r.subType === "あり"; }).length;
  var bowelRate = bowelData.length ? Math.round((bowelOk / bowelData.length) * 100) : null;

  var w = latest && latest.extraData ? latest.extraData.weight : null;
  var bf = latest && latest.extraData ? latest.extraData.bodyFat : null;
  var diff = null;
  if (first && latest && first.extraData && latest.extraData
      && first.extraData.weight != null && latest.extraData.weight != null) {
    diff = Math.round((latest.extraData.weight - first.extraData.weight) * 10) / 10;
  }

  var parts = [];
  parts.push("毎朝ちゃんと記録が続いていますね。続けられている時点で、もう十分前に進んでいます。");
  if (w != null) {
    parts.push("いまの体重は" + w + "kg。");
    if (bf != null) parts.push("体脂肪率は" + bf + "%。");
  }
  if (diff != null && diff < 0) {
    parts.push("記録を始めてから" + Math.abs(diff) + "kg、ゆっくり動いています。焦らなくて大丈夫。");
  } else if (diff != null && diff > 0) {
    parts.push("数字は上下します。記録を続けていることが、いちばん大事なんです。");
  }
  if (exerciseCount > 0) parts.push("運動も" + exerciseCount + "回。動けている日がありますね。");
  if (bowelRate != null) parts.push("お通じ率は" + bowelRate + "%。");
  parts.push("今週は「夕食を写真に残す」だけ、3日試してみませんか。一緒に続けていきましょう。");
  return parts.join("");
}

function isForceOfflineAI_() {
  return PropertiesService.getScriptProperties().getProperty("AI_FORCE_OFFLINE") === "1";
}

/** サマリー・ワンショット分析用（お披露目モード対象） */
function isSummaryAiBlocked_() {
  return isForceOfflineAI_() || isUrlFetchQuotaCached_() || !getGeminiApiKey();
}

/** 対話チャット用（お披露目モードの影響を受けない） */
function isChatAiBlocked_() {
  return isUrlFetchQuotaCached_() || !getGeminiApiKey();
}

function getChatOfflineReason_() {
  if (!getGeminiApiKey()) return "no_api_key";
  if (isUrlFetchQuotaCached_()) return "urlfetch_quota";
  return "unknown";
}

function getAIStatus(data) {
  return {
    status: "success",
    gasVersion: GAS_VERSION,
    chatOnline: !isChatAiBlocked_(),
    summaryOffline: isSummaryAiBlocked_(),
    forceOfflineDemo: isForceOfflineAI_(),
    quotaCached: isUrlFetchQuotaCached_(),
    hasApiKey: !!getGeminiApiKey(),
    chatOfflineReason: getChatOfflineReason_()
  };
}

/** Apps Script → testGetAIStatus を実行（通信1回なし・上限確認用） */
function testGetAIStatus() {
  var s = getAIStatus({});
  Logger.log("=== AI状態 ===");
  Logger.log("GAS版: " + s.gasVersion);
  Logger.log("💬話すタブ: " + (s.chatOnline ? "使える" : "使えない（" + s.chatOfflineReason + "）"));
  Logger.log("📊サマリーAI: " + (s.summaryOffline ? "簡易モード" : "Gemini使用可"));
  Logger.log("お披露目オフライン: " + (s.forceOfflineDemo ? "ON" : "OFF"));
  Logger.log("通信上限フラグ: " + (s.quotaCached ? "ON（今日は上限扱い）" : "OFF"));
  Logger.log("APIキー: " + (s.hasApiKey ? "設定済み" : "未設定"));
  return s;
}

function markUrlFetchQuotaHit_() {
  var t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(0, 0, 0, 0);
  PropertiesService.getScriptProperties().setProperty("AI_OFFLINE_UNTIL", String(t.getTime()));
}

function isUrlFetchQuotaCached_() {
  var until = PropertiesService.getScriptProperties().getProperty("AI_OFFLINE_UNTIL");
  if (!until) return false;
  return new Date().getTime() < Number(until);
}

function offlineAdviceResponse_(records) {
  return {
    status: "success",
    advice: buildOfflineAdvice_(records),
    gasVersion: GAS_VERSION,
    mode: "offline"
  };
}

/**
 * お披露目用: Geminiを使わず記録からコメント生成（通信不要）
 * Apps Script → enableOfflineAIForDemo → 実行 → 再デプロイ
 */
function enableOfflineAIForDemo() {
  PropertiesService.getScriptProperties().setProperty("AI_FORCE_OFFLINE", "1");
  Logger.log("お披露目モードON: サマリーのAI分析のみオフライン。💬話すタブはGeminiを使います。");
  return { status: "success", mode: "offline", chatOnline: !isChatAiBlocked_() };
}

/** 通常モードに戻す（Gemini再開・明日以降） */
function disableOfflineAIForDemo() {
  PropertiesService.getScriptProperties().deleteProperty("AI_FORCE_OFFLINE");
  PropertiesService.getScriptProperties().deleteProperty("AI_OFFLINE_UNTIL");
  Logger.log("通常モードに戻しました。");
  return { status: "success" };
}

function getAIAdvice(data) {
  data = data || {};

  try {
    var records = getRecentRecordsForUser_(data.lineId, 30);
    if (records.length === 0) {
      records = getRecentRecordsForUser_(null, 30);
    }
    if (records.length === 0) {
      return {
        status: "error",
        advice: "分析する記録がありません。先に seedDemoData を実行するか、記録を追加してください。",
        gasVersion: GAS_VERSION
      };
    }

    if (isSummaryAiBlocked_()) {
      return offlineAdviceResponse_(records);
    }

    var context = buildAdviceContext_(records);
    var prompt = "あなたはダイエットと健康管理の専門家AIです。\n"
      + "以下の健康記録を分析し、具体的で実践的なアドバイスを提供してください。\n\n"
      + context + "\n"
      + "親しみやすく励ます口調で、400文字以内でまとめてください。";

    var result = callGeminiWithFallback_(prompt);
    if (result.ok) {
      return { status: "success", advice: result.text, gasVersion: GAS_VERSION };
    }
    if (result.quotaExceeded) {
      markUrlFetchQuotaHit_();
    }

    console.error("Gemini API エラー → オフラインに切替:", result.error);
    return offlineAdviceResponse_(records);
  } catch (err) {
    console.error("getAIAdvice エラー:", err);
    var fallbackRecords = getRecentRecordsForUser_(null, 30);
    if (fallbackRecords.length > 0) {
      return offlineAdviceResponse_(fallbackRecords);
    }
    return {
      status: "error",
      advice: "サーバーエラー（" + GAS_VERSION + "）: " + err.message,
      gasVersion: GAS_VERSION
    };
  }
}

/** Apps Script で AI分析の通しテスト: testGetAIAdvice を実行 */
function testGetAIAdvice() {
  var users = getUsers().result || [];
  if (users.length === 0) {
    Logger.log("ユーザー未登録。先にアプリを1回開いてください。");
    return;
  }
  var res = getAIAdvice({ lineId: users[0].lineId });
  Logger.log(res.status + " / " + res.gasVersion);
  Logger.log(res.advice);
  return res;
}

// =========================================
// デモ用サンプルデータ（お披露目 → 後で削除）
// Apps Script エディタで seedDemoData() を実行
// =========================================

var DEMO_TAG = "【デモ】";

function ensureRecordSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("記録");
  if (!sheet) {
    sheet = ss.insertSheet("記録");
    sheet.appendRow([
      "date", "lineId", "userName", "recordType", "subType",
      "weight", "bodyFat", "muscleMass", "visceralFat",
      "duration", "distance", "memo", "imageUrls", "createdAt"
    ]);
  }
  return sheet;
}

function getSeedTargetUser_() {
  // 特定ユーザーのみ入れたいときは lineId を指定（空なら「ユーザー」シート先頭）
  var overrideLineId = "";
  var overrideName = "デモユーザー";

  if (overrideLineId) {
    return { lineId: overrideLineId, name: overrideName };
  }

  var users = getUsers().result || [];
  if (users.length === 0) {
    throw new Error("ユーザーが未登録です。先にスマホからアプリを1回開いてください。");
  }
  return { lineId: users[0].lineId, name: users[0].name };
}

function formatDateYmd_(date) {
  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd");
}

function appendDemoRow_(sheet, row) {
  sheet.appendRow([
    row.date,
    row.lineId,
    row.userName,
    row.recordType,
    row.subType || "",
    row.weight !== undefined && row.weight !== null ? row.weight : "",
    row.bodyFat !== undefined && row.bodyFat !== null ? row.bodyFat : "",
    row.muscleMass !== undefined && row.muscleMass !== null ? row.muscleMass : "",
    row.visceralFat !== undefined && row.visceralFat !== null ? row.visceralFat : "",
    row.duration !== undefined && row.duration !== null ? row.duration : "",
    row.distance !== undefined && row.distance !== null ? row.distance : "",
    DEMO_TAG + (row.memo || ""),
    "",
    new Date().toISOString()
  ]);
}

/**
 * お披露目用のダミーデータを約3週間分投入（体重は58kg前後）
 * 実行: Apps Script → 関数 seedDemoData → 実行
 */
function seedDemoData() {
  var user = getSeedTargetUser_();
  var sheet = ensureRecordSheet_();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var weights = [
    51.2, 51.0, 50.9, 51.0, 50.8,
    50.7, 50.6, 50.5, 50.6, 50.4,
    50.3, 50.3, 50.2, 50.3, 50.1,
    50.2, 50.1, 50.2, 50.1, 50.0, 50.0
  ];

  var count = 0;

  for (var i = weights.length - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - (weights.length - 1 - i));
    var dateStr = formatDateYmd_(d);
    var w = weights[i];
    var bodyFat = Math.round((25.8 - (weights.length - 1 - i) * 0.04) * 10) / 10;
    var muscle = Math.round((37.8 + (weights.length - 1 - i) * 0.015) * 10) / 10;
    var visceral = i % 3 === 0 ? 8 : (i % 3 === 1 ? 7.5 : 8.5);

    appendDemoRow_(sheet, {
      date: dateStr,
      lineId: user.lineId,
      userName: user.name,
      recordType: "体重",
      subType: "朝計測",
      weight: w,
      bodyFat: bodyFat,
      muscleMass: muscle,
      visceralFat: visceral,
      memo: "朝の計測（サンプル）"
    });
    count++;

    appendDemoRow_(sheet, {
      date: dateStr,
      lineId: user.lineId,
      userName: user.name,
      recordType: "お通じ",
      subType: i % 5 === 0 ? "なし" : "あり",
      memo: ""
    });
    count++;

    if (i % 2 === 0) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "食事",
        subType: "朝食",
        memo: "プロテイン、バナナ"
      });
      count++;
    }
    if (i % 3 === 0) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "食事",
        subType: "昼食",
        memo: "サラダチキン、野菜スープ"
      });
      count++;
    }
    if (i % 4 === 1) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "食事",
        subType: "夕食",
        memo: "焼き魚、味噌汁、小盛りごはん"
      });
      count++;
    }
    if (i % 3 === 1) {
      appendDemoRow_(sheet, {
        date: dateStr,
        lineId: user.lineId,
        userName: user.name,
        recordType: "運動",
        subType: i % 6 === 1 ? "ジム（筋トレ）" : "ウォーキング",
        duration: i % 6 === 1 ? 60 : 40,
        distance: i % 6 === 1 ? "" : 3.2,
        memo: i % 6 === 1 ? "スクワット、腹筋" : "近所を歩く"
      });
      count++;
    }
  }

  Logger.log("デモデータ投入完了: " + count + "件（ユーザー: " + user.name + "）");
  enableOfflineAIForDemo();
  return { status: "success", count: count, user: user };
}

/**
 * 【デモ】タグ付きの行だけ削除（本番データは残る想定）
 * 実行: Apps Script → 関数 clearDemoData → 実行
 */
function clearDemoData() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("記録");
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("削除対象なし");
    return { status: "success", deleted: 0 };
  }

  var values = sheet.getDataRange().getValues();
  var kept = [values[0]];
  var deleted = 0;

  for (var i = 1; i < values.length; i++) {
    var memo = String(values[i][11] || "");
    if (memo.indexOf(DEMO_TAG) === 0) {
      deleted++;
    } else {
      kept.push(values[i]);
    }
  }

  sheet.clearContents();
  if (kept.length > 0) {
    sheet.getRange(1, 1, kept.length, kept[0].length).setValues(kept);
  }

  Logger.log("デモデータ削除完了: " + deleted + "件");
  return { status: "success", deleted: deleted };
}
