<?php

function total(array $values): int {
    return array_sum($values);
}

$rows = [2, 4, 6];
echo total($rows) . PHP_EOL;
