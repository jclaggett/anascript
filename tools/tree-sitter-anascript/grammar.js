/**
 * Starter grammar for Anascript.
 * This intentionally targets highlight/useful structure first, not full parser parity.
 */
module.exports = grammar({
  name: 'anascript',

  extras: $ => [
    /\s/,
    $.comment
  ],

  rules: {
    source_file: $ => repeat($._expr),

    _expr: $ => choice(
      $.list,
      $.vector,
      $.map,
      $.string,
      $.number,
      $.boolean,
      $.null,
      $.undefined,
      $.symbol,
      $.expand,
      $.quote
    ),

    list: $ => seq('(', repeat($._expr), ')'),
    vector: $ => seq('[', repeat($._expr), ']'),
    map: $ => seq('{', repeat($._expr), '}'),

    comment: _ => token(seq('#', /.*/)),
    string: _ => token(seq('"', repeat(choice(/[^"\\]/, /\\./)), '"')),
    number: _ => token(choice(
      /-?\d+\.\d+/,
      /-?\d+/
    )),
    boolean: _ => token(choice('true', 'false')),
    null: _ => 'null',
    undefined: _ => 'undefined',

    // $foo or $42
    expand: $ => seq('$', choice($.symbol, $.number)),
    // \foo
    quote: $ => seq('\\', $.symbol),

    symbol: _ => token(/[A-Za-z_~+\-*/<>=!?][A-Za-z0-9_~+\-*/<>=!?]*/)
  }
})
