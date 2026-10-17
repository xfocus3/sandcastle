package example;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class BasketTest {
    @Test
    void recordsFirstAddition() {
        Basket basket = new Basket();

        basket.add("coffee", 2);

        assertEquals(2, basket.quantityOf("coffee"));
    }
}
