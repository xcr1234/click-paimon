local M = {}
local value = 0

function M.reset()
  value = 0
end

function M.add(points)
  value = value + points
end

function M.get()
  return value
end

return M
