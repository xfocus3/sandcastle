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

    @Test
    void accumulatesRepeatedAdditions() {
        Basket basket = new Basket();

        basket.add("coffee", 2);
        basket.add("coffee", 3);

        assertEquals(5, basket.quantityOf("coffee"));
    }

    @Test
    void returnsZeroForMissingItem() {
        Basket basket = new Basket();

        assertEquals(0, basket.quantityOf("missing"));
    }
}
