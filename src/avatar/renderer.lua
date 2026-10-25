-- Fitted-avatar drawing; API calls and geometry are preserved from the original.
local AVATAR_PIXELS = require("avatar.pixels")

-- 仅填写客户端图片控件的模板索引，不是静态图片 ID 或素材组 ID。
local AVATAR_IMAGE_TEMPLATE_ID = require("config").imageTemplateId
local PIXEL_OVERLAP = 0.6 -- UI单位，轻微重叠以减小独立图片边缘的接缝
local avatarImages = {}

local function clearAvatar()
  for i = #avatarImages, 1, -1 do
    local image = avatarImages[i]
    if image.alive then game.DestroyClientUIControl(image) end
  end
  avatarImages = {}
end

local function drawAvatar(parent, scale)
  clearAvatar()
  if AVATAR_IMAGE_TEMPLATE_ID <= 0 or AVATAR_IMAGE_TEMPLATE_ID % 1 ~= 0 then
    print("[click-paimon] avatar template ID not configured; using legacy avatar")
    return false
  end
  local factor = (164 / 340) * scale
  local ok, err = pcall(function()
    for _, p in ipairs(AVATAR_PIXELS) do
      local image = game.InstantiateClientUIControl(AVATAR_IMAGE_TEMPLATE_ID, parent)
      if image == nil then error("客户端图片模板无法实例化；请核对仅存为模板及模板索引") end
      table.insert(avatarImages, image)
      image.name = "PaimonPixel" .. #avatarImages
      image:SetImage(Enum.ImageSource.StaticReference, p[1])
      image:SetAnchorMin(p[8], p[9])
      image:SetAnchorMax(p[10], p[11])
      image:SetPivot(p[6], p[7])
      image:SetSizeDelta(p[4] * factor + PIXEL_OVERLAP * scale,
        p[5] * factor + PIXEL_OVERLAP * scale)
      image:SetLocalScale(p[12], p[13], 1)
      image:SetLocalRotation(0, 0, p[14])
      image:SetAnchoredPosition(p[2] * factor, p[3] * factor)
      image.imageColor = Color(p[15], p[16], p[17], p[18])
      -- 与作者导出器一致，部分宿主或图片不提供此属性。
      pcall(function() image.imageType = Enum.ImageType.Stretch end)
      image.enableMask = false
      image.enableSoftEdge = false
      image.canControllerFocus = false
      image:SetFillUnused()
      image:SetActive(true)
      image:SetVisible(true)
      image:SetAsLastSibling()
    end
  end)
  if not ok then
    clearAvatar()
    print("[click-paimon] avatar draw failed: " .. tostring(err) .. "; using legacy avatar")
    return false
  end
  print("[click-paimon] Lua avatar ready; pixels=" .. #avatarImages)
  return true
end

-- The host destroys child controls with the parent; only release Lua references here.
local function releaseAvatar()
  avatarImages = {}
end

return { draw = drawAvatar, release = releaseAvatar }
