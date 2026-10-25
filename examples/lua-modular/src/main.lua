-- Keep the editor lifecycle callbacks in the entry module.
local score = require("game.score")

function OnStart()
  score.reset()
  print("modular Lua ready; score=" .. score.get())
end

function OnUpdate(dt)
  -- Forward lifecycle events to your game/UI modules here.
end

function OnDestroy()
  score.reset()
end
