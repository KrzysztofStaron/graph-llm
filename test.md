## Polynomials – A Quick, Friendly Overview

A **polynomial** is just a sum of powers of a variable (usually \\(x\\)) with constant coefficients.
In plain English, it’s an expression that looks like

\\[
a_n x^n + a_{n-1} x^{n-1} + \dots + a_1 x + a_0,
\\]

where

- \\(a*n, a*{n-1}, \dots ,a_0\\) are numbers (real or complex) called **coefficients**,
- \\(n\\) is a non‑negative integer and is called the **degree** of the term \\(a_n x^n\\).
- The **degree of the whole polynomial** is the largest exponent that actually appears (the biggest \\(n\\) with \\(a_n \neq 0\\)).

---

### 1️⃣ Basic Vocabulary

| Term                    | Meaning                                             |
| ----------------------- | --------------------------------------------------- |
| **Monomial**            | A single term like \\(5x^3\\) or \\(-2\\).          |
| **Binomial**            | Two terms, e.g. \\(x^2 + 1\\).                      |
| **Trinomial**           | Three terms, e.g. \\(x^2 - 4x + 4\\).               |
| **Degree**              | Highest exponent with a non‑zero coefficient.       |
| **Leading coefficient** | Coefficient of the highest‑degree term (\\(a_n\\)). |
| **Constant term**       | The term without an \\(x\\) (\\(a_0\\)).            |

---

### 2️⃣ Examples

| Polynomial            | Degree | Leading coeff. | Constant term |
| --------------------- | ------ | -------------- | ------------- |
| \\(3x^4 - 2x^2 + 7\\) | 4      | 3              | 7             |
| \\(-5x + 9\\)         | 1      | \\(-5\\)       | 9             |
| \\(12\\)              | 0      | 12             | 12            |
| \\(x^3 - 4x + 2\\)    | 3      | 1              | 2             |

---

### 3️⃣ Operations on Polynomials

You can **add, subtract, multiply, and divide** (with remainder) polynomials just like numbers.

#### 3.1 Addition / Subtraction

Combine like terms (same power of \\(x\\)).

\\[
\begin{aligned}
(2x^3 + 5x^2 - x) &+ ( -x^3 + 3x^2 + 4) \\\\
&= (2x^3 - x^3) + (5x^2 + 3x^2) + (-x) + 4 \\\\
&= x^3 + 8x^2 - x + 4.
\end{aligned}
\\]

#### 3.2 Multiplication

Use the distributive law (FOIL for binomials, or the “grid” method for larger ones).

\\[
\begin{aligned}
(x^2 + 3x + 2)(x - 1) &= x^2(x-1) + 3x(x-1) + 2(x-1) \\\\
&= x^3 - x^2 + 3x^2 - 3x + 2x - 2 \\\\
&= x^3 + 2x^2 - x - 2.
\end{aligned}
\\]

#### 3.3 Division (Polynomial Long Division)

Divide a polynomial \\(P(x)\\) by a divisor \\(D(x)\\) to get a **quotient** \\(Q(x)\\) and a **remainder** \\(R(x)\\) such that

\\[
P(x) = D(x)\,Q(x) + R(x), \qquad \deg(R) < \deg(D).
\\]

Example: divide \\(x^3 - 2x^2 + 4\\) by \\(x - 1\\).

```
            x^2 - x - 1
          -----------------
x - 1 | x^3 - 2x^2 + 0x + 4
          x^3 -   x^2
          -------------
                -x^2 + 0x
                -x^2 +   x
                ----------
                       -x + 4
                       -x + 1
                       -------
                              3
```

Result:

\\[
\boxed{\,\displaystyle \frac{x^3-2x^2+4}{x-1}=x^2 - x - 1 + \frac{3}{x-1}\,}
\\]

---

### 4️⃣ Roots (Zeros) and Factoring

A **root** (or **zero**) of a polynomial \\(P(x)\\) is a number \\(r\\) such that \\(P(r)=0\\).
If \\(r\\) is a root, then \\((x-r)\\) is a factor of the polynomial (Factor Theorem).

#### Example

\\(P(x)=x^2-5x+6\\).

Find roots: solve \\(x^2-5x+6=0\\).

\\[
\begin{aligned}
x^2-5x+6 &= (x-2)(x-3) = 0 \\\\
\Rightarrow x &= 2 \quad \text{or} \quad x = 3 .
\end{aligned}
\\]

Thus the factorization is

\\[
\boxed{P(x) = (x-2)(x-3)}.
\\]

---

### 5️⃣ Graphical Shape – “What Does It Look Like?”

The **degree** and **leading coefficient** largely dictate the end‑behaviour of the graph.

| Degree (odd/even)     | Leading coeff. \\(>0\\) | Leading coeff. \\(<0\\) |
| --------------------- | ----------------------- | ----------------------- |
| **Even** (e.g., 2, 4) | Both ends **↑** (rise)  | Both ends **↓** (fall)  |
| **Odd** (e.g., 1, 3)  | Left **↓**, right **↑** | Left **↑**, right **↓** |

**Example**: \\(f(x)= -2x^3 + x\\)

- Degree = 3 (odd)
- Leading coeff. = \\(-2\\) (negative)

So as \\(x\to -\infty\\), \\(f(x)\to +\infty\\); as \\(x\to +\infty\\), \\(f(x)\to -\infty\\).
The graph will cross the \\(x\\)-axis up to 3 times (the number of real roots, counting multiplicities).

---

### 6️⃣ A Quick “Cheat Sheet” for Common Forms

| Form                       | Factored form                                           | Roots                                              | Sketch tip                                                |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| \\(ax^2 + bx + c\\)        | \\(a(x-r_1)(x-r_2)\\)                                   | \\(r\_{1,2} = \dfrac{-b \pm \sqrt{b^2-4ac}}{2a}\\) | Parabola; opens up if \\(a>0\\), down if \\(a<0\\).       |
| \\(ax^3 + bx^2 + cx + d\\) | \\((x-r_1)(x-r_2)(x-r_3)\\) (maybe with multiplicities) | Solve cubic (or use rational‑root theorem)         | S‑shaped; can have 1 or 3 real roots.                     |
| \\(a(x-r)^n\\)             | Single root \\(r\\) of multiplicity \\(n\\)             | \\(r\\) (repeated)                                 | Touches the axis if \\(n\\) even, crosses if \\(n\\) odd. |

---

## 🎓 Bottom Line

- A polynomial is a **finite sum of powers of \\(x\\) with constant coefficients**.
- Its **degree** tells you the highest power and heavily influences its graph.
- You can **add, subtract, multiply, divide**, and **factor** polynomials using the same algebraic rules you already know.
- Finding **roots** is the same as solving the equation \\(P(x)=0\\); each root corresponds to a factor \\((x-r)\\).

With these tools, you can tackle everything from simple quadratic equations to higher‑degree problems that appear in calculus, physics, and beyond. Happy algebra‑ing! 🚀
