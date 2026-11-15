extends Node
## Read-only view of the player's money plus convenience wrappers.
## All changes go through GameManager.act() so they are validated (and, when
## online, performed by the server).

signal money_changed(cash: int, bank: int)

var _last_cash := -1
var _last_bank := -1


func _ready() -> void:
	GameManager.state_changed.connect(_check)


func _check() -> void:
	if GameManager.state.is_empty():
		return
	var c := cash()
	var b := bank()
	if c != _last_cash or b != _last_bank:
		_last_cash = c
		_last_bank = b
		money_changed.emit(c, b)


func cash() -> int:
	return int(GameManager.state.get("cash", 0))


func bank() -> int:
	return int(GameManager.state.get("bank", 0))


func total() -> int:
	return cash() + bank()


func net_worth() -> int:
	return PlayerState.net_worth(GameManager.state)


func can_afford(pence: int, method: String = "auto") -> bool:
	return EconomyRules.can_pay(GameManager.state, pence, method)


func deposit(pence: int) -> void:
	GameManager.act("deposit", {"amount": pence})


func withdraw(pence: int) -> void:
	GameManager.act("withdraw", {"amount": pence})


func transactions() -> Array:
	return GameManager.state.get("transactions", [])


func income_history() -> Array:
	var out := []
	for t in transactions():
		if int(t["amount"]) > 0 and t["cat"] != "transfer":
			out.append(t)
	return out


func expense_history() -> Array:
	var out := []
	for t in transactions():
		if int(t["amount"]) < 0 and t["cat"] != "transfer":
			out.append(t)
	return out


func fmt(pence: int) -> String:
	return Money.fmt(pence)
