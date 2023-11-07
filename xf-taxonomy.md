# Taxonomy of transducers

## primitives:
- identity (take-all)
- mapcat [1]
- reductions
- prolog
- epilog
- multiplex
- demultiplex

[1] reducing form of mapcat that is reduced when a special `EOS` value is
injected into returned sequence of values by `f`.

## mapcat derived:
- map
  - constantly
- filter
- drop-all

## reductions & mapcat:
- partition
  - trailing
    - filter2
      - dedupe
- take
- take-while
- drop
- drop-while

## Misc derivations:
- after
- tag
- detag

## multiple input transducers
All multiple input sequences compose from some combination of `multiplex`,
`demultiplex` and the above single input transducers.
