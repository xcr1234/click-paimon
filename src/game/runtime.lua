local avatar = require("avatar.renderer")
local config = require("config")

-- 点击派蒙：客户端 2D UI 脚本，挂在服务端控件容器内的 GameRoot 客户端容器节点。
-- 官方接口依据：《客户端控件API文档》《客户端控件和客户端脚本》（2026-09-25 知识库快照）。

local DURATION = config.duration
local FEEDBACK_DURATION = 0.45
local PULSE_DURATION = 0.18
local state = "ready"
local score = 0
local remaining = DURATION
local ui = {}
local canvasWidth, canvasHeight, scale = 1280, 720, 1
local lastX, lastY = nil, nil
local feedbackLeft, feedbackX, feedbackY = 0, 0, 0
local pulseLeft = 0
local updateLogged = false
local COMPLETE_SIGNAL = config.completionSignal

local function reportCompletion()
  if score <= 0 then
    print("[click-paimon] completion signal skipped; score=0")
    return false
  end
  -- 无参数通关事件；仅正分完成局发送，服务器设置胜利并结算。
  local ok, err = pcall(function()
    local signal = game.ServerSignal(COMPLETE_SIGNAL)
    signal:SendSignal()
  end)
  if ok then
    print("[click-paimon] completion signal sent; score=" .. score)
  else
    print("[click-paimon] completion signal failed: " .. tostring(err))
  end
  return ok
end

-- 内置音效编号统一维护于 config.lua。
local SOUND_IDS = config.sounds
local soundInstances, soundWarnings = {}, {}

local function stopSounds()
  for _, instance in pairs(soundInstances) do
    pcall(function()
      if game.IsAudioAlive(instance) then game.StopAudio(instance) end
    end)
  end
  soundInstances = {}
end

local function playSound(event)
  local ok, err = pcall(function()
    -- 同类音效只保留一个实例，连续点击时避免叠加。
    local previous = soundInstances[event]
    if previous ~= nil and game.IsAudioAlive(previous) then game.StopAudio(previous) end
    soundInstances[event] = game.PlayAudio2D(SOUND_IDS[event])
  end)
  if not ok and not soundWarnings[event] then
    soundWarnings[event] = true
    print("[click-paimon] audio failed: " .. event .. "; " .. tostring(err))
  end
end

local function child(parent, name)
  local control = parent:GetChild(name)
  if control == nil then
    print("[click-paimon] missing control: " .. name)
    error("缺少客户端控件: " .. name)
  end
  if not control.active then
    print("[click-paimon] activating " .. name)
    control:SetActive(true)
    print("[click-paimon] " .. name .. " active=" .. tostring(control.active) .. "; inHierarchy=" .. tostring(control.activeInHierarchy))
  end
  return control
end

local function place(control, x, y, width, height)
  control:SetAnchorMin(0.5, 0.5)
  control:SetAnchorMax(0.5, 0.5)
  control:SetPivot(0.5, 0.5)
  control:SetLocalScale(1, 1, 1)
  control:SetAnchoredPosition(x * scale, y * scale)
  control:SetSizeDelta(width * scale, height * scale)
end

local function styleText(control, text, size, color)
  -- 覆盖 GIA 导出器推定的文本对齐值，使用真机运行时枚举。
  control.horizontalAlignment = Enum.TextHorizontalAlignment.Middle
  control.verticalAlignment = Enum.TextVerticalAlignment.Middle
  control.adaptiveFontSize = false
  control.minimumFontSize = 12
  control.enableOutline = false
  control.fontSize = math.floor(size * scale + 0.5)
  control.fontColor = color
  control.bgColor = Color(0, 0, 0, 0)
  control.text = text
end

local function logText(name, control)
  local r, g, b, a = Color.ToRGBA(control.fontColor)
  print("[click-paimon] TEXT_CHECK " .. name
    .. " fontSize=" .. tostring(control.fontSize)
    .. " adaptive=" .. tostring(control.adaptiveFontSize)
    .. " horizontal=" .. tostring(control.horizontalAlignment)
    .. " vertical=" .. tostring(control.verticalAlignment)
    .. " rgba=" .. tostring(r) .. "," .. tostring(g) .. "," .. tostring(b) .. "," .. tostring(a)
    .. " text=" .. tostring(control.text))
end

local function show(list, visible)
  for _, control in ipairs(list) do control:SetVisible(visible) end
end

local function logControl(name, control)
  local x, y = control:GetAnchoredPosition()
  local width, height = control:GetSizeDelta()
  print("[click-paimon] " .. name .. " active=" .. tostring(control.active)
    .. " inHierarchy=" .. tostring(control.activeInHierarchy)
    .. " visible=" .. tostring(control.visible)
    .. " sibling=" .. tostring(control:GetSiblingIndex())
    .. " pos=" .. tostring(x) .. "," .. tostring(y)
    .. " size=" .. tostring(width) .. "x" .. tostring(height))
end

local function moveTarget()
  -- 中央游玩区：目标全身留在屏内，顶部 HUD 与底部提示留出安全区。
  local maxX = math.min(canvasWidth * 0.34, 450 * scale)
  local minY, maxY = -155 * scale, 160 * scale
  local x, y
  for _ = 1, 8 do
    x = (math.random() * 2 - 1) * maxX
    y = minY + math.random() * (maxY - minY)
    if lastX == nil or (x - lastX) ^ 2 + (y - lastY) ^ 2 >= (95 * scale) ^ 2 then break end
  end
  lastX, lastY = x, y
  ui.target:SetAnchoredPosition(x, y)
end

local function finishGame()
  if state ~= "playing" then return end
  state = "result"
  remaining = 0
  stopSounds()
  playSound("finish")
  ui.timer.text = "0"
  feedbackLeft = 0
  pulseLeft = 0
  ui.hitFeedback:SetVisible(false)
  show(ui.playing, false)
  show(ui.result, true)
  -- 控件显示、布局就绪后再应用文字样式，避免沿用导入时的文本状态。
  styleText(ui.finalScore, tostring(score), 64, Color(255, 226, 144, 255))
  logControl("FinalScoreText", ui.finalScore)
  logText("FinalScoreText", ui.finalScore)
  print("[click-paimon] result UI visible")
  print("game_over " .. score)
  if score > 0 then
    ui.restartLabel.text = "确认通关"
    print("[click-paimon] awaiting completion confirmation")
  else
    ui.restartLabel.text = "再玩一次"
    reportCompletion() -- 0 分只记录跳过，不发送信号。
  end
end

local function beginGame(isRestart)
  if state ~= "ready" and state ~= "result" then return end
  state = "playing"
  score = 0
  remaining = DURATION
  stopSounds()
  playSound("start")
  updateLogged = false
  ui.score.text = "0"
  ui.timer.text = tostring(DURATION)
  feedbackLeft = 0
  pulseLeft = 0
  ui.hitFeedback:SetVisible(false)
  ui.target:SetLocalScale(1, 1, 1)
  if not ui.avatarDrawn then
    ui.aura:SetSizeDelta(158 * scale, 158 * scale)
    ui.aura.imageColor = Color(255, 217, 134, 200)
  end
  show(ui.ready, false)
  show(ui.result, false)
  show(ui.playing, true)
  styleText(ui.timer, tostring(DURATION), 40, Color(255, 226, 144, 255))
  styleText(ui.score, "0", 40, Color(255, 226, 144, 255))
  logControl("TimerText", ui.timer)
  logText("TimerText", ui.timer)
  logControl("ScoreText", ui.score)
  logText("ScoreText", ui.score)
  moveTarget()
  if isRestart then print("restart") else print("game_start") end
end

local function hitTarget()
  if state ~= "playing" or remaining <= 0 then return end
  score = score + 1
  playSound("hit")
  ui.score.text = tostring(score)
  if score == 1 then logText("ScoreText after hit", ui.score) end
  print("score " .. score)
  feedbackLeft = FEEDBACK_DURATION
  feedbackX, feedbackY = lastX, lastY
  ui.hitFeedback:SetAnchoredPosition(feedbackX, feedbackY + 28 * scale)
  ui.hitFeedback.fontColor = Color(255, 226, 144, 255)
  ui.hitFeedback:SetVisible(true)
  pulseLeft = PULSE_DURATION
  moveTarget()
end

local function onStart()
  print("[click-paimon] LUA_AVATAR_V3_5_96_20261018 OnStart entered")
  local root = script.object
  if root == nil then error("[click-paimon] script.object is nil; check main_1 mounting") end
  root.showCursor = true
  print("[click-paimon] GameRoot bound; cursor enabled")
  root:SetVisible(true)
  root:SetLocalScale(1, 1, 1)
  -- 按官方同级排序规则将背景置底。
  local background = child(root, "GameBackground")
  local backgroundIndexBefore = background:GetSiblingIndex()
  local backgroundMoved = background:SetAsFirstSibling()
  print("[click-paimon] GameBackground sibling " .. backgroundIndexBefore .. " -> " .. background:GetSiblingIndex() .. "; moved=" .. tostring(backgroundMoved))
  canvasWidth, canvasHeight = game.GetUICanvasSize()
  -- 真机 UI 画布会随屏幕尺寸缩放；这里仅在小画布上缩小布局，
  -- 避免大屏幕把坐标、尺寸和字体再放大一次，导致 HUD 跑出屏幕。
  scale = math.min(1, canvasWidth / 1280, canvasHeight / 720)
  print("ui_canvas " .. canvasWidth .. "x" .. canvasHeight .. " scale " .. scale)

  ui.readyTitle = child(root, "ReadyTitle")
  ui.readyHelp = child(root, "ReadyHelp")
  ui.start = child(root, "StartButton")
  ui.startLabel = child(ui.start, "StartLabel")
  ui.timerLabel = child(root, "TimerLabel")
  ui.timer = child(root, "TimerText")
  ui.scoreLabel = child(root, "ScoreLabel")
  ui.score = child(root, "ScoreText")
  ui.target = child(root, "PaimonTarget")
  ui.hitFeedback = child(root, "HitFeedback")
  ui.resultTitle = child(root, "ResultTitle")
  ui.resultLabel = child(root, "ResultLabel")
  ui.finalScore = child(root, "FinalScoreText")
  ui.restart = child(root, "RestartButton")
  ui.restartLabel = child(ui.restart, "RestartLabel")
  print("[click-paimon] main UI controls found")

  local white = Color(255, 248, 229)
  local gold = Color(255, 226, 144)
  local blue = Color(38, 64, 120)
  styleText(ui.readyTitle, "点击派蒙", 68, gold)
  styleText(ui.readyHelp, "30 秒挑战！点到派蒙得 1 分", 30, white)
  styleText(ui.startLabel, "开始游戏", 34, white)
  styleText(ui.timerLabel, "剩余时间", 23, white)
  styleText(ui.timer, "30", 40, gold)
  styleText(ui.scoreLabel, "当前得分", 23, white)
  styleText(ui.score, "0", 40, gold)
  styleText(ui.hitFeedback, "+1", 36, gold)
  styleText(ui.resultTitle, "时间到！", 62, gold)
  styleText(ui.resultLabel, "本局总分", 30, white)
  styleText(ui.finalScore, "0", 64, gold)
  styleText(ui.restartLabel, "再玩一次", 34, white)

  place(ui.readyTitle, 0, 130, 620, 100)
  place(ui.readyHelp, 0, 20, 680, 60)
  place(ui.start, 0, -95, 270, 84)
  place(ui.startLabel, 0, 0, 250, 64)
  place(ui.timerLabel, -493, 316, 230, 42)
  -- 数字文本留出超过两倍字号的高度；与上方标签保持间隔。
  -- 真机字体行高可能大于字形高度，原 50/65 和 86/110 布局存在裁切风险。
  place(ui.timer, -493, 242, 230, 96)
  place(ui.scoreLabel, 493, 316, 230, 42)
  place(ui.score, 493, 242, 230, 96)
  place(ui.target, 0, 0, 164, 164)
  place(ui.hitFeedback, 0, 0, 100, 54)
  place(ui.resultTitle, 0, 145, 620, 90)
  place(ui.resultLabel, 0, 57, 500, 55)
  place(ui.finalScore, 0, -42, 340, 140)
  place(ui.restart, 0, -156, 270, 84)
  place(ui.restartLabel, 0, 0, 250, 64)

  -- 隐藏上一版引导中创建但无法选择素材组的空图片。
  local placeholder = ui.target:GetChild("PaimonPortrait")
  if placeholder ~= nil then placeholder:SetVisible(false) end
  ui.avatarDrawn = avatar.draw(ui.target, scale)
  if ui.avatarDrawn then
    for _, legacyName in ipairs({ "PaimonAura", "PaimonHair", "PaimonFace",
        "PaimonHalo", "PaimonLeftEye", "PaimonRightEye", "PaimonName" }) do
      local old = ui.target:GetChild(legacyName)
      if old ~= nil then old:SetVisible(false) end
    end
  else
    local aura = child(ui.target, "PaimonAura")
    ui.aura = aura
    local hair = child(ui.target, "PaimonHair")
    local face = child(ui.target, "PaimonFace")
    local halo = child(ui.target, "PaimonHalo")
    local leftEye = child(ui.target, "PaimonLeftEye")
    local rightEye = child(ui.target, "PaimonRightEye")
    local name = child(ui.target, "PaimonName")
    print("[click-paimon] Paimon child controls found")
    place(aura, 0, 0, 158, 158)
    place(hair, 0, -3, 126, 126)
    place(face, 0, -13, 96, 89)
    place(halo, 0, 68, 60, 48)
    place(leftEye, -20, -7, 13, 19)
    place(rightEye, 20, -7, 13, 19)
    place(name, 0, -50, 120, 36)
    aura.imageColor = Color(255, 217, 134, 200)
    hair.imageColor = Color(248, 250, 244)
    face.imageColor = Color(255, 227, 211)
    halo.imageColor = Color(255, 235, 162)
    leftEye.imageColor = Color(56, 104, 178)
    rightEye.imageColor = Color(56, 104, 178)
    styleText(name, "派蒙", 25, blue)
  end

  ui.ready = { ui.readyTitle, ui.readyHelp, ui.start }
  ui.playing = { ui.timerLabel, ui.timer, ui.scoreLabel, ui.score, ui.target }
  ui.result = { ui.resultTitle, ui.resultLabel, ui.finalScore, ui.restart }
  show(ui.ready, true)
  show(ui.playing, false)
  show(ui.result, false)
  ui.hitFeedback:SetVisible(false)
  background:SetVisible(true)
  ui.startLabel.bgColor = Color(38, 64, 120, 255)
  ui.restartLabel.bgColor = Color(38, 64, 120, 255)
  ui.readyHelp.text = "30 秒挑战！点到派蒙得 1 分 · V3.5"
  logControl("GameBackground", background)
  logControl("ReadyTitle", ui.readyTitle)
  logControl("ReadyHelp", ui.readyHelp)
  logControl("StartButton", ui.start)
  logControl("StartLabel", ui.startLabel)
  print("[click-paimon] ready text: " .. tostring(ui.readyTitle.text) .. " / " .. tostring(ui.startLabel.text))
  print("[click-paimon] ready UI visible; game UI hidden")

  local seed = tonumber(script:GetParam("seed")) or os.time()
  math.randomseed(seed)
  ui.start:AddCursorEventListener(Enum.CursorEventType.CursorClick, function()
    print("[click-paimon] StartButton clicked; state=" .. state)
    beginGame(false)
  end)
  ui.target:AddCursorEventListener(Enum.CursorEventType.CursorClick, hitTarget)
  ui.restart:AddCursorEventListener(Enum.CursorEventType.CursorClick, function()
    if state == "result" and score > 0 then
      state = "settling" -- 发送前锁定，防止重复点击通关。
      ui.restartLabel.text = "通关中…"
      if not reportCompletion() then
        state = "result"
        ui.restartLabel.text = "确认通关"
      end
      return
    end
    print("[click-paimon] ResultButton clicked; state=" .. state)
    beginGame(true)
  end)
  script:EnableUpdate(true)
  print("[click-paimon] click listeners and OnUpdate enabled")
  logText("ReadyTitle", ui.readyTitle)
  logText("ReadyHelp", ui.readyHelp)
  logText("StartLabel", ui.startLabel)
  print("ready")
end

local function onUpdate(dt)
  local elapsed = math.max(0, dt or 0)
  if state ~= "playing" then return end
  if not updateLogged then
    print("[click-paimon] first OnUpdate; dt=" .. tostring(dt))
    updateLogged = true
  end
  local previousSecond = math.ceil(remaining - 0.000001)
  remaining = math.max(0, remaining - elapsed)
  local currentSecond = math.ceil(remaining - 0.000001)
  ui.timer.text = tostring(currentSecond)
  if remaining <= 0.000001 then finishGame(); return end
  if currentSecond >= 1 and currentSecond <= 3 and currentSecond < previousSecond then
    playSound("countdown")
  end

  if feedbackLeft > 0 then
    feedbackLeft = math.max(0, feedbackLeft - elapsed)
    if feedbackLeft == 0 then
      ui.hitFeedback:SetVisible(false)
    else
      local progress = 1 - feedbackLeft / FEEDBACK_DURATION
      ui.hitFeedback:SetAnchoredPosition(feedbackX, feedbackY + (28 + 52 * progress) * scale)
      ui.hitFeedback.fontColor = Color(255, 226, 144, math.floor(255 * (1 - progress) + 0.5))
    end
  end

  if pulseLeft > 0 then
    pulseLeft = math.max(0, pulseLeft - elapsed)
    local strength = pulseLeft / PULSE_DURATION
    if ui.avatarDrawn then
      -- 只缩放一个父点击区域，不逐帧更新数千个图元。
      local pulse = 1 + 0.08 * strength
      ui.target:SetLocalScale(pulse, pulse, 1)
    else
      local size = (158 + 30 * strength) * scale
      ui.aura:SetSizeDelta(size, size)
      ui.aura.imageColor = Color(255, 217, 134, math.floor(200 + 55 * strength + 0.5))
    end
  end
end

local function onDestroy()
  avatar.release()
  stopSounds()
end

return { start = onStart, update = onUpdate, destroy = onDestroy }
