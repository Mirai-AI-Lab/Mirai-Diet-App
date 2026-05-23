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
const GAS_VERSION = "20260524-9";

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
