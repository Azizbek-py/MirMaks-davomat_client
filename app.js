"application/json"
            },

            body:
              JSON.stringify(payload)
          }
        );

      const result =
        await response.json();

      console.log(result);

      if (!response.ok) {

        throw new Error(
          result.detail ||
          "Server xatosi"
        );
      }

      setMessage(
        "Davomat yuborildi ✓"
      );

    } catch (err) {

      console.error(err);

      setMessage(
        err.message,
        true
      );
    }
  }
);
