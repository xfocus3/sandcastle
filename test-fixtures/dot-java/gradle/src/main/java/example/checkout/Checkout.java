package example.checkout;

public final class Checkout {
    public long totalCents(long subtotalCents) {
        if (subtotalCents > 10_000) {
            return subtotalCents - subtotalCents / 10;
        }
        return subtotalCents;
    }
}
