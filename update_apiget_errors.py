import re

with open("src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    '''    } catch (e: any) {
      if (e.message === "Failed to fetch" || e.name === "TypeError") {
        throw new Error("GAS Webアプリへの接続に失敗しました（Failed to fetch）。GAS側の『新しいデプロイ ＞ アクセスできるユーザー』が『全員』（Anyone）になっているか、URLが最新の /exec の本番用URLであるかご確認ください。");
      }
      throw e;
    }
  };

  const handleCreateNote = () => {''',
    '''    } catch (e: any) {
      if (e.message.includes("404")) throw new Error("APIエンドポイントが見つかりません(404)。GASのURL、またはAIモデルの設定を確認してください。");
      if (e.message === "Failed to fetch" || e.name === "TypeError") {
        throw new Error("GAS Webアプリへの接続に失敗しました（Failed to fetch）。GAS側の『新しいデプロイ ＞ アクセスできるユーザー』が『全員』（Anyone）になっているか、URLが最新の /exec の本番用URLであるかご確認ください。");
      }
      throw e;
    }
  };

  const handleCreateNote = () => {'''
)

with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated apiGet block")
