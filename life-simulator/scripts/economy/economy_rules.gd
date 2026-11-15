class_name EconomyRules
extends RefCounted
## Validated money operations on a player state. Every change to cash or bank
## goes through here so it is checked and recorded in the transaction history.
## "method" is "cash", "bank" or "auto" (cash first, then the bank card).


static func can_pay(s: Dictionary, amount: int, method: String = "auto") -> bool:
	if amount < 0:
		return false
	match method:
		"cash":
			return int(s["cash"]) >= amount
		"bank":
			return int(s["bank"]) >= amount
		_:
			return int(s["cash"]) + max(0, int(s["bank"])) >= amount


## Takes money from the player. Returns false (and changes nothing) if they can't afford it.
static func pay(s: Dictionary, amount: int, desc: String, method: String = "auto", category: String = "expense") -> bool:
	if amount < 0 or not can_pay(s, amount, method):
		return false
	if amount == 0:
		return true
	var from_cash := 0
	var from_bank := 0
	match method:
		"cash":
			from_cash = amount
		"bank":
			from_bank = amount
		_:
			from_cash = min(amount, int(s["cash"]))
			from_bank = amount - from_cash
	s["cash"] = int(s["cash"]) - from_cash
	s["bank"] = int(s["bank"]) - from_bank
	var acct := "cash" if from_bank == 0 else ("bank" if from_cash == 0 else "cash+bank")
	log_tx(s, category, -amount, desc, acct)
	return true


## Gives money to the player (salary, sales, rewards).
static func earn(s: Dictionary, amount: int, desc: String, to: String = "bank", category: String = "income") -> bool:
	if amount <= 0:
		return false
	if to == "cash":
		s["cash"] = int(s["cash"]) + amount
	else:
		s["bank"] = int(s["bank"]) + amount
	log_tx(s, category, amount, desc, to)
	s["stats"]["total_earned"] = int(s["stats"].get("total_earned", 0)) + amount
	return true


## A bill that must be paid even if it takes the bank negative (overdraft).
static func charge_bill(s: Dictionary, amount: int, desc: String) -> void:
	if amount <= 0:
		return
	s["bank"] = int(s["bank"]) - amount
	log_tx(s, "bill", -amount, desc, "bank")


static func deposit(s: Dictionary, amount: int) -> Dictionary:
	if amount <= 0:
		return {"ok": false, "msg": "Enter an amount above £0."}
	if int(s["cash"]) < amount:
		return {"ok": false, "msg": "You don't have that much cash."}
	s["cash"] = int(s["cash"]) - amount
	s["bank"] = int(s["bank"]) + amount
	log_tx(s, "transfer", amount, "Cash deposit", "bank")
	s["stats"]["deposited"] = int(s["stats"].get("deposited", 0)) + amount
	return {"ok": true, "msg": "Deposited " + Money.fmt(amount), "events": [{"name": "deposit", "amount": amount}]}


static func withdraw(s: Dictionary, amount: int) -> Dictionary:
	if amount <= 0:
		return {"ok": false, "msg": "Enter an amount above £0."}
	if int(s["bank"]) < amount:
		return {"ok": false, "msg": "Insufficient funds in your account."}
	s["bank"] = int(s["bank"]) - amount
	s["cash"] = int(s["cash"]) + amount
	log_tx(s, "transfer", -amount, "Cash withdrawal", "bank")
	return {"ok": true, "msg": "Withdrew " + Money.fmt(amount), "events": [{"name": "withdraw", "amount": amount}]}


static func log_tx(s: Dictionary, category: String, amount: int, desc: String, acct: String) -> void:
	var tx: Array = s["transactions"]
	tx.append({"cat": category, "amount": amount, "desc": desc, "acct": acct,
		"day": int(s["world"]["day"]), "minute": int(s["world"]["minute"]),
		"cash": int(s["cash"]), "bank": int(s["bank"])})
	if tx.size() > PlayerState.MAX_TRANSACTIONS:
		tx.pop_front()


## Totals of income and expenses from the transaction history.
static func summary(s: Dictionary) -> Dictionary:
	var income := 0
	var expense := 0
	for t in s["transactions"]:
		if t["cat"] == "transfer":
			continue
		if int(t["amount"]) > 0:
			income += int(t["amount"])
		else:
			expense -= int(t["amount"])
	return {"income": income, "expense": expense}
