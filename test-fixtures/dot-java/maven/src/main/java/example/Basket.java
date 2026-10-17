package example;

import java.util.HashMap;
import java.util.Map;

public final class Basket {
    private final Map<String, Integer> quantities = new HashMap<>();

    public void add(String item, int quantity) {
        quantities.put(item, quantity);
    }

    public int quantityOf(String item) {
        return quantities.getOrDefault(item, 0);
    }
}
