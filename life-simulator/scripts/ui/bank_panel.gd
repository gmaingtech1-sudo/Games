class_name BankPanel
extends RefCounted
## Banking: balances, deposits, withdrawals (ATM/bank only) and statements
## with income, expense and full transaction history.

const AMOUNTS := [1000, 5000, 10000, 50000, 100000]   # pence: £10 .. £1,000


static func open(parent: Node, atm: bool) -> void:
	var m := Modal.open(parent, "ATM" if atm else "City Bank", 860, 640)
	build(m.body, true)


## can_transfer: deposits/withdrawals need an ATM or the bank. Phone banking shows statements only.
static func build(parent: Control, can_transfer: bool) -> void:
	var sc := UI.scroll()
	var v := UI.vbox(10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(v)
	parent.add_child(sc)
	var filter := ["all"]
	var rebuild := func(): _fill(v, can_transfer, filter)
	v.set_meta("filter", filter)
	UI.live(v, rebuild)


static func _fill(v: VBoxContainer, can_transfer: bool, filter: Array) -> void:
	UI.clear(v)
	var s := GameManager.state
	var top := UI.hbox(10)
	var c1 := UI.card(Color(0.12, 0.3, 0.22), 14)
	c1.add_child(UI.label("Cash\n" + Money.fmt(int(s["cash"]), true), 24))
	var c2 := UI.card(Color(0.12, 0.22, 0.36), 14)
	c2.add_child(UI.label("Bank\n" + Money.fmt(int(s["bank"]), true), 24, UI.TEXT if int(s["bank"]) >= 0 else UI.BAD))
	var c3 := UI.card(UI.CARD, 14)
	c3.add_child(UI.label("Net worth\n" + Money.fmt(PlayerState.net_worth(s)), 24))
	for c in [c1, c2, c3]:
		UI.expand(c)
		top.add_child(c)
	v.add_child(top)
	if can_transfer:
		v.add_child(UI.header("Deposit cash"))
		var dr := UI.hbox(6)
		for a in AMOUNTS:
			var b := UI.small_button(Money.fmt(a), func(): GameManager.act("deposit", {"amount": a}))
			b.disabled = int(s["cash"]) < a
			UI.expand(b)
			dr.add_child(b)
		var all_d := UI.small_button("All", func(): GameManager.act("deposit", {"amount": int(GameManager.state["cash"])}), UI.ACCENT.darkened(0.3))
		all_d.disabled = int(s["cash"]) <= 0
		dr.add_child(all_d)
		v.add_child(dr)
		v.add_child(UI.header("Withdraw cash"))
		var wr := UI.hbox(6)
		for a in AMOUNTS:
			var b2 := UI.small_button(Money.fmt(a), func(): GameManager.act("withdraw", {"amount": a}))
			b2.disabled = int(s["bank"]) < a
			UI.expand(b2)
			wr.add_child(b2)
		v.add_child(wr)
	else:
		v.add_child(UI.label("Visit an ATM or City Bank to deposit or withdraw cash. Wages, rent and bills go through your bank account.", 17, UI.MUTED))
	var sum := EconomyRules.summary(s)
	v.add_child(UI.label("Recent income %s  •  Recent spending %s" % [Money.fmt(sum["income"]), Money.fmt(sum["expense"])], 18, UI.MUTED))
	var fr := UI.hbox(6)
	for f in [["all", "All"], ["income", "Income"], ["expense", "Expenses"]]:
		var fb := UI.small_button(f[1], func(): filter[0] = f[0]; _fill(v, can_transfer, filter))
		if filter[0] == f[0]:
			fb.add_theme_stylebox_override("normal", UI.box(UI.ACCENT.darkened(0.25), 14))
		UI.expand(fb)
		fr.add_child(fb)
	v.add_child(fr)
	var txs: Array = s["transactions"].duplicate()
	txs.reverse()
	var shown := 0
	for t in txs:
		var amt := int(t["amount"])
		if filter[0] == "income" and (amt <= 0 or t["cat"] == "transfer"):
			continue
		if filter[0] == "expense" and (amt >= 0 or t["cat"] == "transfer"):
			continue
		var row := UI.hbox(8)
		var when := UI.label(UI.fmt_time(int(t["day"]), int(t["minute"])), 15, UI.MUTED)
		when.custom_minimum_size = Vector2(140, 0)
		row.add_child(when)
		var desc := UI.label(str(t["desc"]), 17)
		UI.expand(desc)
		row.add_child(desc)
		row.add_child(UI.label(("+" if amt > 0 else "") + Money.fmt(amt, true), 18, UI.GOOD if amt > 0 else UI.BAD))
		v.add_child(row)
		shown += 1
		if shown >= 60:
			break
	if shown == 0:
		v.add_child(UI.label("No transactions yet.", 18, UI.MUTED))
