-- Single platform entry. Modules and fitted data are embedded during build.
local app = require("game.runtime")

function OnStart()
  app.start()
end

function OnUpdate(dt)
  app.update(dt)
end

function OnDestroy()
  app.destroy()
end
