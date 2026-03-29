homemade(pizza).
homemade(soup).
homemade(fish).
ripe(apple).
ripe(orange).
ripe(banana).
meal(Main, Fruit) :- homemade(Main), !, ripe(Fruit).
