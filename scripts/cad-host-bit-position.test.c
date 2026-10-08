#include <assert.h>
#include <limits.h>
#include <stdio.h>
#include "bits.h"

static void check(size_t byte, unsigned bit, long advance, size_t expected_byte, unsigned expected_bit) {
  Bit_Chain dat = { 0 };
  dat.size = 349670400;
  dat.byte = byte;
  dat.bit = bit;
  bit_advance_position(&dat, advance);
  assert(dat.byte == expected_byte && dat.bit == expected_bit);
}

int main(void) {
  assert(sizeof(long) == 4);
  check(268436712, 0, 8, 268436713, 0);
  check(268435455, 7, 1, 268435456, 0);
  check(268435456, 0, 1, 268435456, 1);
  check(268435456, 7, 8, 268435457, 7);
  check(1, 0, -1, 0, 7);
  check(1, 3, -3, 1, 0);
  check(0, 0, -1, 0, 0);
  check(1, 0, -9, 0, 0);
  check(0, 0, LONG_MIN, 0, 0);
  check(268435456, 0, LONG_MIN, 0, 0);
  check(0, 7, LONG_MAX, 268435456, 6);
  check(268435456, 7, LONG_MAX, 0, 6);
  check(349670399, 7, 1, 349670400, 0);
  check(349670400, 0, 1, 349670400, 1);
  puts("14 checks linked against actual patched libredwg library passed without drawing allocation");
  return 0;
}
