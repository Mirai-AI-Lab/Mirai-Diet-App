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
    59.2, 59.0, 58.8, 58.9, 58.7,
    58.6, 58.5, 58.4, 58.6, 58.3,
    58.2, 58.1, 58.0, 58.2, 57.9,
    58.1, 58.0, 58.3, 58.2, 58.1, 58.0
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
