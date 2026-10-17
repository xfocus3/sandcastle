package example.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CheckoutTest {
    @Test
    void discountsOrdersAboveThreshold() {
        assertEquals(18_000L, new Checkout().totalCents(20_000L));
    }
}
