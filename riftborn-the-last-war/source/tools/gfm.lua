-- Callout boxes become block quotes on GitHub; epigraph wrappers are dropped.
function Div(el)
  if el.classes:includes("callout") then return pandoc.BlockQuote(el.content) end
  if el.classes:includes("epigraph") then return el.content end
end
